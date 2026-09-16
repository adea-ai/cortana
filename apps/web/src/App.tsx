import { FileText, LoaderCircle } from 'lucide-solid'
import {
  lazy,
  Suspense,
  Show,
  Switch,
  Match,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  mergeProps,
  untrack,
  type JSX,
} from 'solid-js'
import {
  getAnswer,
  getDesktopInfo,
  getDesktopInstaller,
  getDesktopServices,
  getDesktopSettings,
  getDesktopUpdate,
  getDocument,
  getDocuments,
  getContext,
  getGraph,
  getReflection,
  getStatus,
  openDesktopSourceSetup,
  runDesktopServicesActionAll,
  saveDesktopSettings,
  cancelDesktopSourceValidation,
  scanDesktopReadiness,
  isDemoMode,
  isDesktopApp,
  openDesktopProject,
  startDesktopSourceAuthorization,
} from './api'
import { ContextPanel } from './components/ContextPanel'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { M7ActivityInbox } from './components/m7/M7ActivityInbox'
import {
  M7ApplicationHeader,
  M7ApplicationNavigation,
  type AppView,
  M7CommandPalette,
  M7PanelBoundary,
  M7ShellProvider,
  M7StatusBar,
} from './components/m7/M7ApplicationShell'
import { SourcePanel } from './components/SourcePanel'
import { UtilityView, type UtilityKind } from './components/UtilityView'
import { Workspace, type WorkspaceTab } from './components/Workspace'
import { TooltipButton as Button } from './components/cortana/TooltipButton'
import { buildAgentContext, estimateTokens } from './context'
import { embeddingLabel } from './operations'
import {
  readSourceSelectionPreference,
  readWorkspacePreference,
  writeSourceSelectionPreference,
  writeWorkspacePreference,
} from './workspacePreference'
import {
  activeJobs,
  describeSourceJobProgress,
  sourceJobAttention,
  useSourceJobs,
} from './sourceJobs'
import { applyTheme, DEFAULT_THEME } from './theme'
import { readWorkspaceThemePreference, WORKSPACE_THEME_EVENT } from './workspaceThemePreference'
import type {
  AnswerResponse,
  BrainDocument,
  BrainDocumentSummary,
  BrainGraphNode,
  BrainGraphPage,
  BrainStatus,
  ContextBundle,
  DesktopSettings,
  DesktopInfo,
  DesktopInstallJob,
  DesktopReadiness,
  DesktopReadinessActivity,
  DesktopServiceActivity,
  DesktopServiceReport,
  DesktopSourceJob,
  DesktopUpdate,
  Evidence,
  ReflectResponse,
} from './types'
import { useDesktopForeground } from './lib/foreground'
import { cn } from './lib/utils'
import './shadcn.css'
const loadSettingsView = () => import('./components/SettingsView')
const SettingsView = lazy(() =>
  loadSettingsView().then((module) => ({
    default: module.SettingsView,
  }))
)
// Settings is the only lazy shell surface and it is reached on essentially
// every session, so warm its chunk once the browser is idle instead of
// paying the fetch when the operator first opens the view.
const prefetchSettingsView = () => {
  const idle = window.requestIdleCallback ?? ((work: () => void) => window.setTimeout(work, 1200))
  idle(() => void loadSettingsView())
}
const STATUS_REFRESH_MS = 15_000
const INSTALLER_POLL_MS = 1_000
const MAX_DOCUMENT_QUERY_BYTES = 256
const textEncoder = new TextEncoder()
function isAbort(caught: unknown) {
  return caught instanceof DOMException
    ? caught.name === 'AbortError'
    : (
        caught as {
          name?: string
        } | null
      )?.name === 'AbortError'
}
function searchScope(nextSource: string, nextWorkspace: string, query: string) {
  return `${nextWorkspace}\u0000${nextSource}\u0000${query}`
}
function contextScope(nextQuery: string, nextWorkspace: string, nextSource: string) {
  return `${nextWorkspace}\u0000${nextSource}\u0000${nextQuery}`
}
// Kobalte restores trigger focus when an overlay closes a macrotask after
// the select event, and while an overlay is still open its focus trap can
// pull focus back; a modal menu also refocuses its trigger even when the
// close-focus event is prevented. Keep re-focusing until the target holds
// focus across several checks, so it wins no matter when the overlay
// finishes dismissing.
function focusWhenReady(
  focus: () =>
    | (HTMLElement & {
        select?: () => void
      })
    | null
    | undefined,
  select = false
) {
  let attempts = 400
  let settled = 0
  const tryFocus = () => {
    const el = focus()
    if (!el || attempts <= 0) return
    attempts -= 1
    if (document.activeElement !== el) {
      settled = 0
      el.focus()
      if (select) el.select?.()
    } else {
      settled += 1
      if (settled >= 4) return
    }
    window.setTimeout(tryFocus, 5)
  }
  window.setTimeout(tryFocus, 5)
}
export function App() {
  return (
    <AppErrorBoundary>
      <CortanaApplication />
    </AppErrorBoundary>
  )
}
function CortanaApplication() {
  const [query, setQuery] = createSignal('How do releases work?')
  const [activeQuery, setActiveQuery] = createSignal(query())
  const [status, setStatus] = createSignal<BrainStatus | null>(null)
  const [evidence, setEvidence] = createSignal<Evidence[]>([])
  const [answer, setAnswer] = createSignal<AnswerResponse | null>(null)
  const [reflection, setReflection] = createSignal<ReflectResponse | null>(null)
  const [selected, setSelected] = createSignal(0)
  const [source, setSource] = createSignal(
    (() => (isDesktopApp ? readSourceSelectionPreference() : ''))()
  )
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal('')
  const [statusError, setStatusError] = createSignal('')
  const [leftOpen, setLeftOpen] = createSignal(false)
  const [rightOpen, setRightOpen] = createSignal(false)
  const [view, setView] = createSignal<AppView>('knowledge')
  const [workspace, setWorkspace] = createSignal(
    (() => (isDesktopApp ? readWorkspacePreference() : ''))()
  )
  const [workspaceTab, setWorkspaceTab] = createSignal<WorkspaceTab>('document')
  const [desktopSettings, setDesktopSettings] = createSignal<DesktopSettings | null>(null)
  const [desktopInfo, setDesktopInfo] = createSignal<DesktopInfo | null>(null)
  const [desktopServices, setDesktopServices] = createSignal<DesktopServiceReport | null>(null)
  const [desktopServicesError, setDesktopServicesError] = createSignal('')
  const [settingsSection, setSettingsSection] = createSignal<
    'readiness' | 'services' | 'updates' | 'sources' | 'memory'
  >('readiness')
  const [settingsDirty, setSettingsDirty] = createSignal(false)
  const [installerJob, setInstallerJob] = createSignal<DesktopInstallJob | null>(null)
  const [desktopUpdate, setDesktopUpdate] = createSignal<DesktopUpdate | null>(null)
  const [desktopReadiness, setDesktopReadiness] = createSignal<DesktopReadiness | null>(null)
  const [readinessActivity, setReadinessActivity] = createSignal<DesktopReadinessActivity | null>(
    null
  )
  const [serviceActivity, setServiceActivity] = createSignal<DesktopServiceActivity | null>(null)
  const [sourceJobError, setSourceJobError] = createSignal('')
  const [sourceToggleBusy, setSourceToggleBusy] = createSignal<string | null>(null)
  const [sourceToggleError, setSourceToggleError] = createSignal('')
  const [sourceToggleNotice, setSourceToggleNotice] = createSignal('')
  const [documents, setDocuments] = createSignal<BrainDocumentSummary[]>([])
  const [documentCursor, setDocumentCursor] = createSignal<string | null>(null)
  const [documentsLoading, setDocumentsLoading] = createSignal(view() === 'knowledge')
  const [documentsError, setDocumentsError] = createSignal('')
  const [documentRetryNonce, setDocumentRetryNonce] = createSignal(0)
  const [activeDocument, setActiveDocument] = createSignal<BrainDocument | null>(null)
  const [documentLoading, setDocumentLoading] = createSignal(false)
  const [documentQuery, setDocumentQuery] = createSignal('')
  const [debouncedDocumentQuery, setDebouncedDocumentQuery] = createSignal('')
  const [commandPaletteOpen, setCommandPaletteOpen] = createSignal(false)
  const [sourceWidth, setSourceWidth] = createSignal(270)
  const [contextWidth, setContextWidth] = createSignal(350)
  const [contextBundle, setContextBundle] = createSignal<ContextBundle | null>(null)
  const [contextLoading, setContextLoading] = createSignal(false)
  const [graph, setGraph] = createSignal<BrainGraphPage | null>(null)
  const [graphLoading, setGraphLoading] = createSignal(false)
  const [graphAppendLoading, setGraphAppendLoading] = createSignal(false)
  const [graphError, setGraphError] = createSignal('')
  const [graphRetryNonce, setGraphRetryNonce] = createSignal(0)
  const [graphFocusDocumentId, setGraphFocusDocumentId] = createSignal<string | null>(null)
  const [graphEdgeKind, setGraphEdgeKind] = createSignal<
    BrainGraphPage['edges'][number]['kind'] | 'all'
  >('all')
  const [graphOrigin, setGraphOrigin] = createSignal<
    NonNullable<BrainGraphPage['edges'][number]['origin']> | 'all'
  >('all')
  const [graphMinConfidence, setGraphMinConfidence] = createSignal<number | null>(null)
  const [graphFocusHistory, setGraphFocusHistory] = createSignal<Array<string | null>>([null])
  const [graphFocusHistoryIndex, setGraphFocusHistoryIndex] = createSignal(0)
  const pageVisible = useDesktopForeground()
  const searchRequestRef = {
    current: 0,
  }
  const [contextError, setContextError] = createSignal('')
  const [queryHistory, setQueryHistory] = createSignal<string[]>([])
  const [queryHistoryIndex, setQueryHistoryIndex] = createSignal(-1)
  const searchRef = {
    current: null as HTMLInputElement | null,
  }
  const commandPaletteOriginRef = {
    current: null as HTMLElement | null,
  }
  const sourcePanelOriginRef = {
    current: null as HTMLElement | null,
  }
  const contextPanelOriginRef = {
    current: null as HTMLElement | null,
  }
  const sourceJobs = useSourceJobs()
  const sourceCancelInFlightRef = {
    current: new Set<string>(),
  }
  const sourceJobsError = () => sourceJobError() || sourceJobs.error()
  const sourceJobsRetry = () =>
    sourceJobError() ? undefined : sourceJobs.error() ? sourceJobs.retry : undefined
  const workspaces = createMemo(() =>
    desktopSettings()?.workspaces.length
      ? desktopSettings()!.workspaces
      : status()?.workspaces.length
        ? status()!.workspaces
        : Array.from(new Set(status()?.sources.map((item) => item.project) ?? [])).map((id) => ({
            id,
            name: id[0]?.toUpperCase() + id.slice(1),
            account_label: null,
            color: null,
          }))
  )
  const effectiveWorkspace = createMemo(() => workspace() || workspaces()[0]?.id || '')
  const installerStatusRef = {
    current: null as DesktopInstallJob['status'] | null | null,
  }
  const installerJobId = () => installerJob()?.id ?? null
  const installerStatus = () => installerJob()?.status ?? null
  const installerActive = () =>
    installerStatus() === 'running' || installerStatus() === 'cancelling'
  const desktopUpdatePhase = () => desktopUpdate()?.phase ?? null
  const desktopSettingsRequestRef = {
    current: 0,
  }
  const desktopInfoRequestRef = {
    current: 0,
  }
  const desktopUpdateRequestRef = {
    current: 0,
  }
  const desktopServicesRequestRef = {
    current: 0,
  }
  const refreshedSourceJobsRef = {
    current: new Set() as Set<string>,
  }
  const documentScope = () =>
    `${effectiveWorkspace()}\u0000${source()}\u0000${debouncedDocumentQuery()}`
  const documentFetchReady = () => !isDesktopApp || desktopSettings()?.needs_setup === false
  const searchAbortRef = {
    current: null as AbortController | null | null,
  }
  const searchScopeRef = {
    current: '',
  }
  const contextAbortRef = {
    current: null as AbortController | null | null,
  }
  const contextScopeRef = {
    current: '',
  }
  const documentListAbortRef = {
    current: null as AbortController | null | null,
  }
  const documentSelectAbortRef = {
    current: null as AbortController | null | null,
  }
  const graphAbortRef = {
    current: null as AbortController | null | null,
  }
  const contextRequestRef = {
    current: 0,
  }
  const documentListRequestRef = {
    current: 0,
  }
  const documentSelectRequestRef = {
    current: 0,
  }
  const graphRequestRef = {
    current: 0,
  }
  const graphAppendRequestRef = {
    current: 0,
  }
  const statusRequestRef = {
    current: 0,
  }
  const statusRefreshRef = {
    current: null as (() => void) | null | null,
  }
  const documentPageLoadingRef = {
    current: false,
  }
  const applyDesktopSettings = (next: DesktopSettings) => {
    // Invalidate the one-shot bootstrap read when Settings completes a
    // reload/save. Otherwise a slower initial request can restore an older
    // snapshot after the operator has already reconciled a newer one.
    desktopSettingsRequestRef.current += 1
    setDesktopSettings(next)
  }
  onMount(() => prefetchSettingsView())
  createEffect(() => {
    const syncTheme = () => {
      applyTheme(readWorkspaceThemePreference(effectiveWorkspace()) ?? DEFAULT_THEME)
    }
    syncTheme()
    window.addEventListener(WORKSPACE_THEME_EVENT, syncTheme)
    return onCleanup(() => {
      window.removeEventListener(WORKSPACE_THEME_EVENT, syncTheme)
    })
  })
  createEffect(() => {
    if (!isDemoMode) return
    let active = true
    void import('./demoDesktop').then(
      ({ demoDesktopInfo, demoDesktopServices, demoDesktopState }) => {
        if (!active) return
        const requested = new URLSearchParams(window.location.search).get('demo-state')
        const state = demoDesktopState(
          requested &&
            [
              'setup',
              'busy',
              'success',
              'warning',
              'failure',
              'cancelled',
              'retry',
              'recovery',
            ].includes(requested)
            ? (requested as Parameters<typeof demoDesktopState>[0])
            : 'configured'
        )
        setDesktopSettings(state.settings)
        setDesktopInfo(demoDesktopInfo)
        setDesktopServices(demoDesktopServices)
        setDesktopUpdate(state.update)
        setDesktopReadiness(state.readiness)
        setReadinessActivity(state.readinessActivity)
        setServiceActivity(state.serviceActivity)
        setInstallerJob(state.installerJob)
        return null
      }
    )
    return onCleanup(() => {
      active = false
    })
  })
  const runReadinessScan = async (): Promise<DesktopReadiness> => {
    setReadinessActivity({
      status: 'running',
      detail: null,
    })
    try {
      const next = await scanDesktopReadiness()
      setDesktopReadiness(next)
      setReadinessActivity({
        status: 'succeeded',
        detail: null,
      })
      return next
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : 'Readiness scan failed'
      setReadinessActivity({
        status: 'failed',
        detail,
      })
      throw caught
    }
  }
  createEffect(() => {
    // The signal read must stay synchronous so the effect tracks it; a read
    // inside the timeout callback would make the debounce run only once.
    const next = boundDocumentQuery(documentQuery()).trim()
    const timeout = window.setTimeout(() => {
      setDebouncedDocumentQuery(next)
    }, 250)
    return onCleanup(() => window.clearTimeout(timeout))
  })
  createEffect(() => {
    if (!pageVisible()) return
    let disposed = false
    let initialRequest = true
    let controller: AbortController | null = null
    const refresh = () => {
      controller?.abort()
      const nextController = new AbortController()
      controller = nextController
      const requestId = ++statusRequestRef.current
      const isInitialRequest = initialRequest
      initialRequest = false
      void getStatus(nextController.signal)
        .then((result) => {
          if (disposed || nextController.signal.aborted || statusRequestRef.current !== requestId)
            return null
          setStatus(result)
          setStatusError('')
          return null
        })
        .catch((caught: unknown) => {
          if (disposed || nextController.signal.aborted || statusRequestRef.current !== requestId)
            return
          setStatusError(caught instanceof Error ? caught.message : 'Status unavailable')
        })
        .finally(() => {
          // Status is independent from an in-flight query. If a user submits
          // a search before the first health request finishes, the status
          // response must not hide the query's loading state.
          if (
            isInitialRequest &&
            !disposed &&
            !nextController.signal.aborted &&
            statusRequestRef.current === requestId &&
            searchRequestRef.current === 0
          ) {
            setLoading(false)
          }
        })
    }
    statusRefreshRef.current = refresh
    refresh()
    const timer = window.setInterval(refresh, STATUS_REFRESH_MS)
    return onCleanup(() => {
      disposed = true
      window.clearInterval(timer)
      controller?.abort()
      statusRequestRef.current += 1
      if (statusRefreshRef.current === refresh) statusRefreshRef.current = null
    })
  })
  const documentScopeKey = () =>
    [
      view(),
      documentFetchReady(),
      source(),
      effectiveWorkspace(),
      debouncedDocumentQuery(),
      documentRetryNonce(),
      desktopSettings() === null,
    ].join('\u0000')
  const [previousDocumentScopeKey, setPreviousDocumentScopeKey] = createSignal(documentScopeKey())
  createEffect(() => {
    if (documentScopeKey() === previousDocumentScopeKey()) return
    setPreviousDocumentScopeKey(documentScopeKey())
    if (view() !== 'knowledge') {
      // Settings and utility views do not consume the document list. Keep the
      // last Knowledge snapshot so returning to it feels continuous, while the
      // next Knowledge render still performs a fresh scoped read.
      setDocumentsLoading(false)
    } else if (!documentFetchReady()) {
      setDocuments([])
      setDocumentCursor(null)
      setDocumentsError('')
      setActiveDocument(null)
      // Keep the Knowledge pane honest during the one transient state where
      // Desktop settings have not arrived yet. Once setup is known to be
      // required, or while Settings is open, there is no document request to
      // wait for and the empty state should be calm instead of spinning.
      setDocumentsLoading(isDesktopApp && desktopSettings() === null)
    } else {
      setDocumentsError('')
      setActiveDocument(null)
      setDocumentsLoading(true)
    }
  })
  createEffect(() => {
    // Desktop settings are the control-plane gate for the document index. On
    // first launch the settings request can redirect the shell to setup; do
    // not query a half-configured backend (or surface a noisy error) before
    // the user has finished that flow. The Knowledge view is the only surface
    // that consumes this list, so avoid background reads while managing the
    // local runtime in Settings as well. State resets above run during render.
    if (view() !== 'knowledge' || !documentFetchReady()) {
      documentListRequestRef.current += 1
      documentListAbortRef.current?.abort()
      documentPageLoadingRef.current = false
      return
    }
    const requestId = ++documentListRequestRef.current
    documentListAbortRef.current?.abort()
    const controller = new AbortController()
    documentListAbortRef.current = controller
    const requestedScope = documentScope()
    documentPageLoadingRef.current = true
    void getDocuments(
      effectiveWorkspace() || undefined,
      source() || undefined,
      debouncedDocumentQuery() || undefined,
      undefined,
      controller.signal
    )
      .then((page) => {
        if (documentListRequestRef.current !== requestId) return null
        if (documentScope() !== requestedScope) return null
        setDocuments(page.documents)
        setDocumentCursor(page.next_cursor)
        return null
      })
      .catch((caught: unknown) => {
        if (isAbort(caught) || controller.signal.aborted) return
        if (documentListRequestRef.current !== requestId) return
        if (documentScope() !== requestedScope) return
        setDocuments([])
        setDocumentCursor(null)
        setDocumentsError(caught instanceof Error ? caught.message : 'Documents unavailable')
      })
      .finally(() => {
        if (
          documentListRequestRef.current === requestId &&
          !controller.signal.aborted &&
          documentScope() === requestedScope
        ) {
          documentPageLoadingRef.current = false
          setDocumentsLoading(false)
        }
      })
    return onCleanup(() => {
      controller.abort()
      if (documentListRequestRef.current === requestId && documentScope() === requestedScope) {
        documentPageLoadingRef.current = false
        setDocumentsLoading(false)
      }
    })
  })
  const graphScopeKey = () =>
    [
      view(),
      workspaceTab(),
      documentFetchReady(),
      source(),
      effectiveWorkspace(),
      debouncedDocumentQuery(),
      graphRetryNonce(),
      graphFocusDocumentId(),
      graphEdgeKind(),
      graphOrigin(),
      graphMinConfidence(),
    ].join('\u0000')
  const [previousGraphScopeKey, setPreviousGraphScopeKey] = createSignal(graphScopeKey())
  createEffect(() => {
    if (graphScopeKey() === previousGraphScopeKey()) return
    setPreviousGraphScopeKey(graphScopeKey())
    setGraph(null)
    setGraphError('')
    setGraphLoading(view() === 'knowledge' && workspaceTab() === 'graph' && documentFetchReady())
    setGraphAppendLoading(false)
  })
  createEffect(() => {
    if (view() !== 'knowledge' || workspaceTab() !== 'graph' || !documentFetchReady()) {
      graphRequestRef.current += 1
      graphAbortRef.current?.abort()
      graphAppendRequestRef.current += 1
      return
    }
    const requestId = ++graphRequestRef.current
    graphAbortRef.current?.abort()
    const controller = new AbortController()
    graphAbortRef.current = controller
    graphAppendRequestRef.current += 1
    void getGraph(
      effectiveWorkspace() || undefined,
      source() || undefined,
      debouncedDocumentQuery() || undefined,
      undefined,
      controller.signal,
      {
        focusDocumentId: graphFocusDocumentId() || undefined,
        edgeKind:
          graphEdgeKind() === 'all'
            ? undefined
            : (graphEdgeKind() as BrainGraphPage['edges'][number]['kind']),
        origin:
          graphOrigin() === 'all'
            ? undefined
            : (graphOrigin() as NonNullable<BrainGraphPage['edges'][number]['origin']>),
        minConfidence: graphMinConfidence() ?? undefined,
      }
    )
      .then((result) => {
        if (graphRequestRef.current !== requestId || controller.signal.aborted) return null
        setGraph(result)
        return null
      })
      .catch((caught: unknown) => {
        if (isAbort(caught) || controller.signal.aborted) return
        if (graphRequestRef.current !== requestId) return
        setGraphError(caught instanceof Error ? caught.message : 'Graph data unavailable')
      })
      .finally(() => {
        if (graphRequestRef.current === requestId && !controller.signal.aborted) {
          setGraphLoading(false)
        }
      })
    return onCleanup(() => controller.abort())
  })
  function loadMoreGraph() {
    const current = graph()
    const cursor = current?.next_cursor
    if (!cursor || graphLoading() || graphAppendLoading()) return
    const requestId = ++graphAppendRequestRef.current
    setGraphAppendLoading(true)
    void getGraph(
      effectiveWorkspace() || undefined,
      source() || undefined,
      debouncedDocumentQuery() || undefined,
      cursor
    )
      .then((result) => {
        if (graphAppendRequestRef.current !== requestId) return null
        setGraph((previous) => {
          if (!previous) return result
          const nodes = [...previous.nodes]
          const nodeIds = new Set(nodes.map((node) => node.id))
          for (const node of result.nodes) {
            if (!nodeIds.has(node.id)) nodes.push(node)
          }
          const edges = [...previous.edges]
          const edgeIds = new Set(edges.map((edge) => `${edge.source}:${edge.target}:${edge.kind}`))
          for (const edge of result.edges) {
            const edgeId = `${edge.source}:${edge.target}:${edge.kind}`
            if (!edgeIds.has(edgeId)) edges.push(edge)
          }
          return {
            nodes,
            edges,
            next_cursor: result.next_cursor,
          }
        })
        return null
      })
      .catch((caught: unknown) => {
        if (graphAppendRequestRef.current === requestId) {
          setGraphError(caught instanceof Error ? caught.message : 'Graph data unavailable')
        }
      })
      .finally(() => {
        if (graphAppendRequestRef.current === requestId) setGraphAppendLoading(false)
      })
  }
  createEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey
      const target = event.target as HTMLElement | null
      const editing =
        target?.isContentEditable === true ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT'
      const key = event.key.toLowerCase()
      if (event.key === 'Escape') {
        setCommandPaletteOpen(false)
        setLeftOpen(false)
        setRightOpen(false)
        return
      }
      // Keep command/filter shortcuts out of text fields. Cmd/Ctrl+K remains
      // intentionally global because it is the app's primary search action.
      if (editing && !(modifier && key === 'k')) return
      if (modifier && key === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (modifier && key === 'p') {
        event.preventDefault()
        setCommandPaletteOpen((open) => {
          if (!open) {
            commandPaletteOriginRef.current =
              document.activeElement instanceof HTMLElement &&
              document.activeElement !== document.body
                ? document.activeElement
                : searchRef.current
          }
          return !open
        })
      } else if (modifier && event.shiftKey && key === 'f') {
        event.preventDefault()
        setLeftOpen(true)
        window.setTimeout(() => document.getElementById('document-filter')?.focus(), 0)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return onCleanup(() => window.removeEventListener('keydown', handleKeyDown))
  })
  createEffect(() => {
    function clampPaneWidths() {
      if (window.innerWidth <= 1280) return
      const available = window.innerWidth - 72 - 520
      const nextSource = Math.min(sourceWidth(), Math.max(220, available - 280))
      const nextContext = Math.min(contextWidth(), Math.max(280, available - nextSource))
      setSourceWidth(nextSource)
      setContextWidth(nextContext)
    }
    window.addEventListener('resize', clampPaneWidths)
    // The initial clamp reads the width signals; untrack it so pane drags do
    // not re-register the listener. Later invocations run outside tracking.
    untrack(clampPaneWidths)
    return onCleanup(() => window.removeEventListener('resize', clampPaneWidths))
  })
  createEffect(() => {
    if (!isDesktopApp) return
    const requestId = ++desktopSettingsRequestRef.current
    const infoRequestId = ++desktopInfoRequestRef.current
    const updateRequestId = ++desktopUpdateRequestRef.current
    let active = true
    void getDesktopSettings()
      .then((result) => {
        if (!active || desktopSettingsRequestRef.current !== requestId) return null
        setDesktopSettings(result)
        if (result.needs_setup) setView('settings')
        return null
      })
      .catch(() => {
        if (active && desktopSettingsRequestRef.current === requestId) setView('settings')
      })
    void getDesktopInfo()
      .then((result) => {
        if (active && desktopInfoRequestRef.current === infoRequestId) {
          setDesktopInfo(result)
          return null
        }
        return null
      })
      .catch(() => {
        // The settings view will surface the local configuration error.
      })
    void getDesktopUpdate()
      .then((result) => {
        if (active && desktopUpdateRequestRef.current === updateRequestId) {
          setDesktopUpdate(result)
          return null
        }
        return null
      })
      .catch(() => {
        // The Updates section will surface a more specific updater error.
      })
    return onCleanup(() => {
      active = false
      desktopInfoRequestRef.current += 1
      desktopUpdateRequestRef.current += 1
      if (desktopSettingsRequestRef.current === requestId) {
        desktopSettingsRequestRef.current += 1
      }
    })
  })
  createEffect(() => {
    if (!isDesktopApp || !pageVisible()) return
    let disposed = false
    let requestInFlight = false
    const refresh = () => {
      if (disposed || requestInFlight) return
      requestInFlight = true
      const requestId = ++desktopServicesRequestRef.current
      void getDesktopServices()
        .then((result) => {
          if (disposed || desktopServicesRequestRef.current !== requestId) return null
          setDesktopServices(result)
          if (result.activity) setServiceActivity(result.activity)
          setDesktopServicesError('')
          return null
        })
        .catch((caught: unknown) => {
          if (disposed || desktopServicesRequestRef.current !== requestId) return
          setDesktopServicesError(
            caught instanceof Error ? caught.message : 'Service status is unavailable'
          )
        })
        .finally(() => {
          requestInFlight = false
        })
    }
    refresh()
    const timer = window.setInterval(refresh, STATUS_REFRESH_MS)
    return onCleanup(() => {
      disposed = true
      window.clearInterval(timer)
      desktopServicesRequestRef.current += 1
    })
  })
  createEffect(() => {
    if (!isDesktopApp) return
    const completed = sourceJobs
      .jobs()
      .filter(
        (job) =>
          job.completed_at_unix_seconds !== null && !['running', 'cancelling'].includes(job.status)
      )
    const completedIds = new Set(completed.map((job) => job.id))
    for (const id of refreshedSourceJobsRef.current) {
      if (!completedIds.has(id)) refreshedSourceJobsRef.current.delete(id)
    }
    const unseen = completed.filter((job) => !refreshedSourceJobsRef.current.has(job.id))
    if (unseen.length === 0) return
    unseen.forEach((job) => refreshedSourceJobsRef.current.add(job.id))
    let active = true
    const requestId = ++statusRequestRef.current
    void getStatus()
      .then((result) => {
        if (!active || statusRequestRef.current !== requestId) return null
        setStatus(result)
        setStatusError('')
        return null
      })
      .catch((caught: unknown) => {
        if (!active || statusRequestRef.current !== requestId) return
        setStatusError(caught instanceof Error ? caught.message : 'Status unavailable')
      })
    return onCleanup(() => {
      active = false
      if (statusRequestRef.current === requestId) statusRequestRef.current += 1
    })
  })
  createEffect(() => {
    if (!isDesktopApp || !installerJobId() || !installerActive() || !pageVisible()) return
    let disposed = false
    let requestInFlight = false
    const poll = () => {
      if (disposed || requestInFlight) return
      requestInFlight = true
      void getDesktopInstaller(installerJobId()!)
        .then((result) => {
          if (!disposed) setInstallerJob(result)
          return null
        })
        .catch((caught: unknown) => {
          // Installer jobs are held in native memory. If a Desktop restart
          // discarded the job, clear the stale shell snapshot instead of
          // showing an install that can no longer be inspected.
          if (!disposed && isMissingInstallerJobError(caught)) setInstallerJob(null)
        })
        .finally(() => {
          requestInFlight = false
        })
    }
    poll()
    const timer = window.setInterval(poll, INSTALLER_POLL_MS)
    return onCleanup(() => {
      disposed = true
      window.clearInterval(timer)
    })
  })
  createEffect(() => {
    const previous = installerStatusRef.current
    installerStatusRef.current = installerStatus()
    if (
      !isDesktopApp ||
      !installerStatus() ||
      installerStatus() !== 'succeeded' ||
      previous === 'succeeded' ||
      !previous ||
      !['running', 'cancelling'].includes(previous)
    ) {
      return
    }
    // The shell owns installer polling, so it also owns the post-install
    // readiness scan. This keeps the result when Settings is unmounted.
    void runReadinessScan().catch(() => {})
  })
  createEffect(() => {
    if (
      !isDesktopApp ||
      !desktopUpdatePhase() ||
      !['downloading', 'installing', 'cancelling'].includes(desktopUpdatePhase()!) ||
      !pageVisible()
    ) {
      return
    }
    let disposed = false
    let requestInFlight = false
    const poll = () => {
      if (disposed || requestInFlight) return
      requestInFlight = true
      void getDesktopUpdate()
        .then((result) => {
          if (!disposed) setDesktopUpdate(result)
          return null
        })
        .catch(() => {
          // Keep the last progress snapshot while the native updater is busy.
        })
        .finally(() => {
          requestInFlight = false
        })
    }
    poll()
    const timer = window.setInterval(poll, 400)
    return onCleanup(() => {
      disposed = true
      window.clearInterval(timer)
    })
  })
  const agentContext = createMemo(() => buildAgentContext(activeQuery(), evidence()))
  function boundDocumentQuery(boundedQuery: string) {
    if (textEncoder.encode(boundedQuery).length <= MAX_DOCUMENT_QUERY_BYTES) {
      return boundedQuery
    }
    const parts: string[] = []
    let bytes = 0
    for (const token of boundedQuery) {
      const nextBytes = textEncoder.encode(token).length
      if (bytes + nextBytes > MAX_DOCUMENT_QUERY_BYTES) break
      bytes += nextBytes
      parts.push(token)
    }
    return parts.join('')
  }
  const abortSearchRequest = (): void => {
    // A connector or test double may resolve after AbortController fires. The
    // generation check keeps that stale result from returning to the shell.
    searchRequestRef.current += 1
    searchAbortRef.current?.abort()
    setLoading(false)
    setError('')
  }
  const abortContextRequest = (): void => {
    contextRequestRef.current += 1
    contextAbortRef.current?.abort()
    setContextBundle(null)
    setContextLoading(false)
    setContextError('')
  }
  const clearScopedResults = (): void => {
    documentListRequestRef.current += 1
    documentListAbortRef.current?.abort()
    documentSelectRequestRef.current += 1
    documentSelectAbortRef.current?.abort()
    graphRequestRef.current += 1
    graphAbortRef.current?.abort()
    documentPageLoadingRef.current = false
    setDocuments([])
    setDocumentCursor(null)
    setDocumentsLoading(true)
    setDocumentsError('')
    setDocumentLoading(false)
    setAnswer(null)
    setReflection(null)
    setEvidence([])
    setSelected(0)
    setActiveDocument(null)
    setWorkspaceTab('document')
    setGraph(null)
    setGraphError('')
    setGraphLoading(false)
    setGraphFocusDocumentId(null)
    setGraphFocusHistory([null])
    setGraphFocusHistoryIndex(0)
  }
  const scopeSources = (nextWorkspace: string, nextSource = source()) => {
    const nextScope = searchScope(nextSource, nextWorkspace, query())
    searchScopeRef.current = nextScope
    contextScopeRef.current = contextScope(activeQuery(), nextWorkspace, nextSource)
  }
  async function runSearch(
    value: string,
    nextSource = source(),
    nextWorkspace = effectiveWorkspace(),
    recordHistory = true
  ) {
    if (recordHistory) {
      const sliced = queryHistory().slice(0, queryHistoryIndex() + 1)
      const nextHistory = sliced.at(-1) === value ? sliced : [...sliced, value]
      setQueryHistory(nextHistory)
      setQueryHistoryIndex(nextHistory.length - 1)
    }
    const requestId = ++searchRequestRef.current
    const requestedScope = searchScope(nextSource, nextWorkspace, value)
    setLoading(true)
    setError('')
    // Keep the active result surface visible while retrieval is in flight.
    // Otherwise a search started from the document tab looks idle until the
    // answer arrives.
    setWorkspaceTab('answer')
    searchScopeRef.current = requestedScope
    const controller = new AbortController()
    searchAbortRef.current?.abort()
    searchAbortRef.current = controller
    try {
      const next = await getAnswer(
        value,
        nextWorkspace || undefined,
        nextSource || undefined,
        controller.signal
      )
      if (searchRequestRef.current !== requestId || searchScopeRef.current !== requestedScope) {
        return
      }
      setAnswer(next)
      setReflection(null)
      setContextBundle(null)
      setEvidence(next.evidence)
      setActiveQuery(value)
      setSelected(0)
    } catch (caught) {
      if (controller.signal.aborted || isAbort(caught)) return
      if (searchRequestRef.current !== requestId || searchScopeRef.current !== requestedScope) {
        return
      }
      setError(caught instanceof Error ? caught.message : 'Search failed')
      setAnswer(null)
      setReflection(null)
      setEvidence([])
    } finally {
      if (
        searchRequestRef.current === requestId &&
        searchScopeRef.current === requestedScope &&
        !controller.signal.aborted
      ) {
        setLoading(false)
      }
    }
  }
  async function runReflection() {
    const value = query().trim()
    if (!value || loading()) return
    const requestId = ++searchRequestRef.current
    const requestedScope = searchScope(source(), effectiveWorkspace(), value)
    const controller = new AbortController()
    searchAbortRef.current?.abort()
    searchAbortRef.current = controller
    searchScopeRef.current = requestedScope
    setLoading(true)
    setError('')
    setWorkspaceTab('answer')
    try {
      const reflectionResult = await getReflection(
        value,
        effectiveWorkspace() || undefined,
        source() || undefined,
        controller.signal
      )
      if (searchRequestRef.current !== requestId || searchScopeRef.current !== requestedScope)
        return
      setAnswer(null)
      setReflection(reflectionResult)
      setEvidence([])
      setActiveQuery(value)
      setSelected(0)
    } catch (caught) {
      if (controller.signal.aborted || isAbort(caught)) return
      setError(caught instanceof Error ? caught.message : 'Reflection failed')
    } finally {
      if (searchRequestRef.current === requestId && !controller.signal.aborted) setLoading(false)
    }
  }
  function submit(event: SubmitEvent) {
    event.preventDefault()
    const value = query().trim()
    if (!value || !canLeaveSettings()) return
    // The title-bar search is global, so submitting it from a utility or
    // settings view must return to the answer surface; otherwise the request
    // succeeds behind the current page and looks like a broken search action.
    setView('knowledge')
    void runSearch(value)
  }
  function configuredSourceFor(sourceName: string, project: string) {
    return desktopSettings()?.sources.find(
      (candidate) =>
        candidate.project === project &&
        (candidate.name === sourceName || candidate.source === sourceName)
    )
  }
  function openSettingsAt(section: 'readiness' | 'services' | 'updates' | 'sources' | 'memory') {
    if (!canLeaveSettings()) return
    setSettingsSection(section)
    setView('settings')
  }
  async function toggleSource(nextSource: string, project: string, enabled: boolean) {
    const key = `${project}:${nextSource}`
    if (sourceToggleBusy()) return
    if (!isDesktopApp || !desktopSettings()) {
      setSettingsSection('sources')
      setView('settings')
      return
    }
    if (settingsDirty()) {
      setSourceToggleError('Save or discard settings changes before toggling a source.')
      setSettingsSection('sources')
      setView('settings')
      return
    }
    const current = configuredSourceFor(nextSource, project)
    if (!current || current.enabled === enabled) {
      setSourceToggleError(
        current ? '' : `${nextSource} is not present in the saved Desktop source configuration.`
      )
      return
    }
    if (
      !window.confirm(
        `${enabled ? 'Enable' : 'Disable'} ${nextSource} in ${project}?\n\nThis changes future ingestion only. Existing indexed data remains queryable and is not deleted.`
      )
    ) {
      return
    }
    setSourceToggleBusy(key)
    setSourceToggleError('')
    setSourceToggleNotice('')
    try {
      const next = await saveDesktopSettings({
        workspaces: desktopSettings()!.workspaces,
        sources: desktopSettings()!.sources.map((candidate) =>
          candidate === current
            ? {
                ...candidate,
                enabled,
              }
            : candidate
        ),
        auth_principals: desktopSettings()!.auth_principals,
        embedding: desktopSettings()!.embedding,
        query: desktopSettings()!.query,
        memory: desktopSettings()!.memory,
        ingestion: desktopSettings()!.ingestion,
        runtime: desktopSettings()!.runtime,
        secrets: [],
      })
      applyDesktopSettings(next)
      if (next.restart_required) {
        // The saved source change needs a service restart to take effect.
        // Handle it in the background and name the outcome instead of asking
        // the operator to guess which service needs attention.
        setServiceActivity({
          target: 'core services',
          action: 'restart',
          status: 'running',
          detail: null,
        })
        setSourceToggleNotice(
          'Source setting saved. Restarting the affected services in the background…'
        )
        void runDesktopServicesActionAll('restart')
          .then(() => {
            setServiceActivity({
              target: 'core services',
              action: 'restart',
              status: 'succeeded',
              detail: null,
            })
            applyDesktopSettings({
              ...next,
              restart_required: false,
            })
            setSourceToggleNotice(
              'Source setting saved. Affected services restarted in the background.'
            )
            return null
          })
          .catch((caught: unknown) => {
            const detail = caught instanceof Error ? caught.message : 'Core services restart failed'
            setServiceActivity({
              target: 'core services',
              action: 'restart',
              status: 'failed',
              detail,
            })
            setSourceToggleError(
              `Source setting saved, but the service restart failed (${detail}). Open Settings → Services to restart the affected services manually.`
            )
          })
      } else {
        setSourceToggleNotice('Source setting saved for future ingestion.')
      }
      try {
        const nextStatus = await getStatus()
        setStatus(nextStatus)
        setStatusError('')
      } catch (caught) {
        // The source setting is already persisted. Keep that success visible
        // and report only the best-effort health refresh failure.
        setStatusError(caught instanceof Error ? caught.message : 'Source status refresh failed')
      }
    } catch (caught) {
      setSourceToggleError(
        caught instanceof Error ? caught.message : 'Source setting could not be saved'
      )
    } finally {
      setSourceToggleBusy(null)
    }
  }
  async function openSourceSetup(sourceName: string, project: string) {
    if (sourceToggleBusy()) return
    if (!isDesktopApp || !desktopSettings() || desktopSettings()!.needs_setup || settingsDirty()) {
      setSettingsSection('sources')
      setView('settings')
      return
    }
    const configuredSource = configuredSourceFor(sourceName, project)
    if (!configuredSource) {
      setSourceToggleError(
        `${sourceName} in ${project} is not present in the saved Desktop source configuration.`
      )
      return
    }
    if (
      configuredSource &&
      ['google-drive', 'gmail', 'google-calendar'].includes(configuredSource.kind)
    ) {
      // Google authorization needs both an OAuth client and a writable token
      // destination. Keep incomplete setup in the typed source editor instead
      // of opening a provider URL that cannot fix the saved configuration.
      setSettingsSection('sources')
      setView('settings')
      return
    }
    setSourceToggleBusy(`setup:${sourceName}`)
    setSourceToggleError('')
    setSourceToggleNotice('')
    try {
      await openDesktopSourceSetup(configuredSource.name)
      setSourceToggleNotice('Provider setup opened in your browser.')
    } catch (caught) {
      setSourceToggleError(
        caught instanceof Error ? caught.message : 'Provider setup could not open'
      )
    } finally {
      setSourceToggleBusy(null)
    }
  }
  async function authorizeSource(sourceName: string, project: string) {
    if (sourceToggleBusy()) return
    if (!isDesktopApp || !desktopSettings() || desktopSettings()!.needs_setup || settingsDirty()) {
      setSettingsSection('sources')
      setView('settings')
      return
    }
    const configuredSource = configuredSourceFor(sourceName, project)
    if (!configuredSource) {
      setSourceToggleError(
        `${sourceName} in ${project} is not present in the saved Desktop source configuration.`
      )
      return
    }
    if (
      !window.confirm(
        `Authorize ${sourceName} in ${project} with Google?\n\nCortana will open the system browser and store the read-only token in the configured private file.`
      )
    ) {
      return
    }
    setSourceToggleBusy(`authorize:${sourceName}`)
    setSourceToggleError('')
    setSourceToggleNotice('')
    try {
      const job = await startDesktopSourceAuthorization(configuredSource.name)
      sourceJobs.remember(job)
      setSourceToggleNotice('Google authorization opened in your browser.')
    } catch (caught) {
      setSourceToggleError(
        caught instanceof Error ? caught.message : 'Google authorization could not start'
      )
    } finally {
      setSourceToggleBusy(null)
    }
  }
  function chooseSource(next: string, project?: string, toggle = true) {
    const requestedWorkspace = project ?? workspace()
    const nextWorkspace = requestedWorkspace || (workspaces()[0]?.id ?? '')
    const sameScope = toggle && source() === next && workspace() === nextWorkspace
    const nextSource = sameScope ? '' : next
    abortSearchRequest()
    abortContextRequest()
    clearScopedResults()
    scopeSources(nextWorkspace, nextSource)
    if (project || workspace() !== nextWorkspace) {
      setWorkspace(nextWorkspace)
      if (isDesktopApp) {
        writeWorkspacePreference(nextWorkspace)
      }
    }
    if (isDesktopApp) {
      writeSourceSelectionPreference(nextSource)
    }
    setSource(nextSource)
    setLeftOpen(false)
  }
  const chooseWorkspace = (next: string) => {
    const nextWorkspace = next || (workspaces()[0]?.id ?? '')
    const nextSource = ''
    if (nextWorkspace !== effectiveWorkspace() || source() !== nextSource) {
      abortSearchRequest()
      abortContextRequest()
      clearScopedResults()
      scopeSources(nextWorkspace, nextSource)
    }
    setWorkspace(nextWorkspace)
    setSource(nextSource)
    if (isDesktopApp) {
      writeWorkspacePreference(nextWorkspace)
      writeSourceSelectionPreference(nextSource)
    }
  }
  function focusGraphNode(node: BrainGraphNode) {
    if (node.kind === 'document' && node.document_id) {
      navigateGraphFocus(node.document_id)
      return
    }
    if (node.kind === 'workspace') {
      chooseWorkspace(node.project)
      return
    }
    if (node.kind === 'source' && node.source) {
      chooseSource(node.source, node.project, false)
    }
  }
  function navigateGraphFocus(documentId: string | null) {
    if (documentId === graphFocusDocumentId()) return
    const nextHistory = [...graphFocusHistory().slice(0, graphFocusHistoryIndex() + 1), documentId]
    setGraphFocusHistory(nextHistory)
    setGraphFocusHistoryIndex(nextHistory.length - 1)
    setGraphFocusDocumentId(documentId)
  }
  function navigateGraphHistory(offset: -1 | 1) {
    const nextIndex = graphFocusHistoryIndex() + offset
    if (nextIndex < 0 || nextIndex >= graphFocusHistory().length) return
    setGraphFocusHistoryIndex(nextIndex)
    setGraphFocusDocumentId(graphFocusHistory()[nextIndex] ?? null)
  }
  async function loadMoreDocuments() {
    if (!documentCursor() || documentsLoading() || documentPageLoadingRef.current) return
    const requestedScope = documentScope()
    const requestId = ++documentListRequestRef.current
    const controller = new AbortController()
    documentListAbortRef.current?.abort()
    documentListAbortRef.current = controller
    documentPageLoadingRef.current = true
    setDocumentsLoading(true)
    setDocumentsError('')
    try {
      const page = await getDocuments(
        effectiveWorkspace() || undefined,
        source() || undefined,
        debouncedDocumentQuery() || undefined,
        documentCursor() ?? undefined,
        controller.signal
      )
      if (documentListRequestRef.current !== requestId) return
      if (documentScope() !== requestedScope) return
      setDocuments((current) => [
        ...current,
        ...page.documents.filter((item) => !current.some((existing) => existing.id === item.id)),
      ])
      setDocumentCursor(page.next_cursor)
    } catch (caught) {
      if (isAbort(caught) || controller.signal.aborted) return
      if (documentListRequestRef.current !== requestId) return
      if (documentScope() === requestedScope) {
        setDocumentsError(caught instanceof Error ? caught.message : 'Documents unavailable')
      }
    } finally {
      if (
        documentListRequestRef.current === requestId &&
        !controller.signal.aborted &&
        documentScope() === requestedScope
      ) {
        documentPageLoadingRef.current = false
        setDocumentsLoading(false)
      }
    }
  }
  async function chooseDocument(id: string) {
    const requestId = ++documentSelectRequestRef.current
    const controller = new AbortController()
    documentSelectAbortRef.current?.abort()
    documentSelectAbortRef.current = controller
    setDocumentLoading(true)
    setDocumentsError('')
    try {
      const next = await getDocument(id, controller.signal)
      if (documentSelectRequestRef.current !== requestId) return
      setActiveDocument(next)
      setLeftOpen(false)
    } catch (caught) {
      if (
        documentSelectRequestRef.current !== requestId ||
        controller.signal.aborted ||
        isAbort(caught)
      )
        return
      setDocumentsError(caught instanceof Error ? caught.message : 'Document unavailable')
    } finally {
      if (documentSelectRequestRef.current === requestId && !controller.signal.aborted) {
        setDocumentLoading(false)
      }
    }
  }
  async function retrieveAgentContext() {
    const requestId = ++contextRequestRef.current
    const requestedScope = contextScope(activeQuery(), effectiveWorkspace(), source())
    setContextLoading(true)
    setContextError('')
    contextScopeRef.current = requestedScope
    const controller = new AbortController()
    contextAbortRef.current?.abort()
    contextAbortRef.current = controller
    try {
      const next = await getContext(
        activeQuery(),
        effectiveWorkspace() || undefined,
        source() || undefined,
        controller.signal
      )
      if (contextRequestRef.current !== requestId || contextScopeRef.current !== requestedScope) {
        return
      }
      setContextBundle(next)
    } catch (caught) {
      if (
        contextAbortRef.current?.signal.aborted ||
        contextRequestRef.current !== requestId ||
        contextScopeRef.current !== requestedScope ||
        isAbort(caught)
      ) {
        return
      }
      setContextError(caught instanceof Error ? caught.message : 'Context retrieval failed')
    } finally {
      if (
        contextRequestRef.current === requestId &&
        contextScopeRef.current === requestedScope &&
        !controller.signal.aborted
      ) {
        setContextLoading(false)
      }
    }
  }
  function canLeaveSettings() {
    if (view() !== 'settings' || !settingsDirty()) return true
    const leave = window.confirm('Discard unsaved Cortana settings changes?')
    if (leave) setSettingsDirty(false)
    return leave
  }
  function navigate(next: AppView) {
    if (next !== 'settings' && !canLeaveSettings()) return
    setView(next)
    // Returning to Knowledge restores the default tab unless the last
    // surface is the completed answer, which stays the active result.
    if (next === 'knowledge' && workspaceTab() !== 'answer') setWorkspaceTab('document')
  }
  function focusSearch() {
    if (!canLeaveSettings()) return
    setView('knowledge')
    focusWhenReady(() => searchRef.current, true)
  }
  function focusDocumentFilter() {
    if (!canLeaveSettings()) return
    setView('knowledge')
    setLeftOpen(true)
    // The source panel is hidden while the graph is full-screen; leave the
    // graph so the filter and document list are reachable again.
    if (workspaceTab() === 'graph') setWorkspaceTab('document')
    focusWhenReady(() => document.getElementById('document-filter') as HTMLElement | null)
  }
  function panelOrigin(origin?: HTMLElement | null) {
    return (
      origin ??
      (document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : searchRef.current)
    )
  }
  function openSourcePanel(origin?: HTMLElement | null) {
    sourcePanelOriginRef.current = panelOrigin(origin)
    setLeftOpen(true)
    if (workspaceTab() === 'graph') setWorkspaceTab('document')
  }
  function openContextPanel(origin?: HTMLElement | null) {
    contextPanelOriginRef.current = panelOrigin(origin)
    setRightOpen(true)
  }
  function openCommandPalette(origin?: HTMLElement | null) {
    commandPaletteOriginRef.current =
      origin ??
      (document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : searchRef.current)
    setCommandPaletteOpen(true)
  }
  function cancelSourceJob(id: string) {
    if (sourceCancelInFlightRef.current.has(id)) return
    const current = sourceJobs.jobs().find((job) => job.id === id)
    if (!current || current.status !== 'running') return
    sourceCancelInFlightRef.current.add(id)
    sourceJobs.remember({
      ...current,
      status: 'cancelling',
      summary: `Cancelling source ${current.operation}…`,
    })
    setSourceJobError('')
    void cancelDesktopSourceValidation(id)
      .then(sourceJobs.remember)
      .then(() => setSourceJobError(''))
      .catch((caught: unknown) => {
        // If native cancellation failed before it could change the job,
        // restore the last known running snapshot so the operator can retry.
        sourceJobs.remember(current)
        setSourceJobError(
          caught instanceof Error ? caught.message : 'Source job cancellation failed'
        )
      })
      .finally(() => {
        sourceCancelInFlightRef.current.delete(id)
      })
  }
  const retryStatus = () => {
    statusRefreshRef.current?.()
  }
  const retryDocuments = () => {
    setDocumentsError('')
    setDocumentRetryNonce((current) => current + 1)
  }
  function openGraph() {
    if (!canLeaveSettings()) return
    setView('knowledge')
    setWorkspaceTab('graph')
  }
  function retryGraph() {
    setGraphRetryNonce((current) => current + 1)
  }
  function maximumPaneWidth(side: 'source' | 'context') {
    if (window.innerWidth <= 1280) return 520
    return Math.max(
      side === 'source' ? 220 : 280,
      Math.min(
        520,
        window.innerWidth - 72 - 520 - (side === 'source' ? contextWidth() : sourceWidth())
      )
    )
  }
  function beginResize(side: 'source' | 'context', event: PointerEvent) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = side === 'source' ? sourceWidth() : contextWidth()
    const move = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      const width = side === 'source' ? startWidth + delta : startWidth - delta
      const minimum = side === 'source' ? 220 : 280
      const bounded = Math.max(minimum, Math.min(width, maximumPaneWidth(side)))
      if (side === 'source') setSourceWidth(bounded)
      else setContextWidth(bounded)
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }
  const configuredSourcesForWorkspace = createMemo(() => {
    if (!effectiveWorkspace()) return []
    return Array.from(
      new Set([
        ...(desktopSettings()?.sources ?? [])
          .filter((item) => item.project === effectiveWorkspace())
          .flatMap((item) =>
            [item.name, item.source].filter((value): value is string => Boolean(value))
          ),
        ...(status()?.ingestion.configured_sources ?? [])
          .filter((item) => item.project === effectiveWorkspace())
          .map((item) => item.source),
        ...(status()?.sources ?? [])
          .filter((item) => item.project === effectiveWorkspace())
          .map((item) => item.source),
      ])
    )
  })
  // Settings may arrive before the runtime status call. An empty settings
  // source list is not enough evidence to evict a persisted source because
  // the runtime may still report configured/indexed sources shortly after
  // launch. Treat the inventory as authoritative once status is available,
  // or once non-empty saved source settings are present.
  const sourceInventoryReady = () =>
    status() !== null || (desktopSettings()?.sources.length ?? 0) > 0
  const desktopSourceActionsReady = () =>
    isDesktopApp &&
    desktopSettings() !== null &&
    !desktopSettings()!.needs_setup &&
    desktopSettings()!.sources.length > 0
  const workspaceScope = () =>
    workspaces()
      .map((item) => item.id)
      .join('\u0000')
  createEffect(() => {
    if (!workspaceScope()) return
    // Wait for the canonical workspace inventory before auto-selecting; the
    // status-derived fallback list has a different order and would leave the
    // shell pinned to the wrong workspace.
    if (isDesktopApp && desktopSettings() === null) return
    if (workspace() && workspaces().some((item) => item.id === workspace())) return
    // reconciles the workspace selection with the loaded inventory and persists it
    chooseWorkspace(workspaces()[0]?.id ?? '')
  })
  createEffect(() => {
    if (!isDesktopApp || !source()) return
    if (isDesktopApp && desktopSettings() === null) return
    if (!sourceInventoryReady() || configuredSourcesForWorkspace().includes(source())) return
    writeSourceSelectionPreference('')
    // evicts a source no longer in the configured inventory; also persists and rescopes
    setSource('')
    scopeSources(effectiveWorkspace(), '')
  })

  // The Graph rail is a full-screen alternative to the document workspace:
  // while it is active the source and context panels collapse so the graph
  // spans the whole width between the rail and the status bar.
  const graphFullScreen = () => view() === 'knowledge' && workspaceTab() === 'graph'
  return (
    <M7ShellProvider>
      <div
        class={cn('shell m7-production-shell', graphFullScreen() && 'graph-fullscreen')}
        data-m7-production-shell-ready={''}
        style={
          {
            '--source-width': graphFullScreen() ? '0px' : `${sourceWidth()}px`,
            '--context-width': graphFullScreen() ? '0px' : `${contextWidth()}px`,
          } as JSX.CSSProperties
        }
      >
        <a class={'m7-skip-link'} href="#main-content">
          Skip to main content
        </a>
        {
          <M7ApplicationHeader
            query={query()}
            loading={loading()}
            searchRef={searchRef}
            canGoBack={queryHistoryIndex() > 0}
            canGoForward={
              queryHistoryIndex() >= 0 && queryHistoryIndex() < queryHistory().length - 1
            }
            onQueryChange={setQuery}
            onSubmit={submit}
            onReflect={() => void runReflection()}
            onHistoryBack={() => {
              const nextIndex = queryHistoryIndex() - 1
              if (nextIndex < 0) return
              const next = queryHistory()[nextIndex]
              setQueryHistoryIndex(nextIndex)
              setQuery(next)
              void runSearch(next, source(), effectiveWorkspace(), false)
            }}
            onHistoryForward={() => {
              const nextIndex = queryHistoryIndex() + 1
              if (nextIndex >= queryHistory().length) return
              const next = queryHistory()[nextIndex]
              setQueryHistoryIndex(nextIndex)
              setQuery(next)
              void runSearch(next, source(), effectiveWorkspace(), false)
            }}
            onOpenSources={openSourcePanel}
            onOpenFilters={focusDocumentFilter}
            onOpenHistory={() => navigate('conversations')}
            onOpenContext={openContextPanel}
            onOpenCommands={openCommandPalette}
            workspaceName={
              workspaces().find((item) => item.id === effectiveWorkspace())?.name ?? 'Workspace'
            }
            location={
              view() === 'knowledge'
                ? workspaceTab() === 'graph'
                  ? 'Graph'
                  : workspaceTab() === 'timeline'
                    ? 'Timeline'
                    : 'Knowledge'
                : view() === 'agent-tools'
                  ? 'Agent tools'
                  : view()[0].toUpperCase() + view().slice(1)
            }
          />
        }
        {
          <M7ApplicationNavigation
            navigation={{
              view: view(),
              workspaceTab: workspaceTab(),
              onNavigate: navigate,
              onOpenGraph: openGraph,
            }}
            workspaces={workspaces()}
            workspace={effectiveWorkspace()}
            onWorkspaceChange={chooseWorkspace}
          />
        }
        {view() === 'settings' ? (
          <Suspense
            fallback={
              <main id="main-content" class="settings-view" aria-busy="true">
                <p role="status">
                  <LoaderCircle class="spin" size={16} /> Loading settings…
                </p>
              </main>
            }
          >
            <SettingsView
              desktopSettings={desktopSettings() ?? undefined}
              onLoaded={applyDesktopSettings}
              initialSection={settingsSection()}
              onDirtyChange={setSettingsDirty}
              onJob={sourceJobs.remember}
              sourceJobs={sourceJobs.jobs()}
              installerJob={installerJob()}
              onInstallerJob={setInstallerJob}
              readiness={desktopReadiness()}
              onReadiness={setDesktopReadiness}
              readinessActivity={readinessActivity()}
              onReadinessScan={runReadinessScan}
              desktopUpdate={desktopUpdate() ?? undefined}
              onDesktopUpdate={setDesktopUpdate}
              services={desktopServices()}
              onServices={(nextServices) => {
                setDesktopServices(nextServices)
                if (nextServices.activity) setServiceActivity(nextServices.activity)
              }}
              servicesError={desktopServicesError()}
              onServicesError={setDesktopServicesError}
              desktopInfo={desktopInfo()}
              onDesktopInfo={setDesktopInfo}
              serviceActivity={serviceActivity()}
              onServiceActivity={setServiceActivity}
              onSaved={(next) => {
                applyDesktopSettings(next)
                setSettingsDirty(false)
                // A settings save can change the configured embedding/runtime
                // services. Refresh the shell-owned snapshots immediately rather
                // than waiting for the next 15-second health tick.
                const servicesRequestId = ++desktopServicesRequestRef.current
                void getDesktopServices()
                  .then((nextServices) => {
                    if (desktopServicesRequestRef.current !== servicesRequestId) return null
                    setDesktopServices(nextServices)
                    if (nextServices.activity) setServiceActivity(nextServices.activity)
                    setDesktopServicesError('')
                    return null
                  })
                  .catch((caught: unknown) => {
                    if (desktopServicesRequestRef.current !== servicesRequestId) return
                    setDesktopServicesError(
                      caught instanceof Error ? caught.message : 'Service status is unavailable'
                    )
                  })
                const infoRequestId = ++desktopInfoRequestRef.current
                void getDesktopInfo()
                  .then((nextInfo) => {
                    if (desktopInfoRequestRef.current === infoRequestId) {
                      setDesktopInfo(nextInfo)
                    }
                    return null
                  })
                  .catch(() => {
                    // Keep the previous metadata snapshot when the refresh is
                    // unavailable; the Services panel can retry explicitly.
                  })
                const statusRequestId = ++statusRequestRef.current
                void getStatus()
                  .then((nextStatus) => {
                    if (statusRequestRef.current !== statusRequestId) return null
                    setStatus(nextStatus)
                    setStatusError('')
                    return null
                  })
                  .catch(() => {
                    if (statusRequestRef.current !== statusRequestId) return
                    setStatusError('Status unavailable after saving settings')
                  })
                if (
                  !next.workspaces.some((item) => item.id === effectiveWorkspace()) &&
                  next.workspaces.length > 0
                ) {
                  chooseWorkspace(next.workspaces[0].id)
                } else if (
                  source() &&
                  !next.sources.some(
                    (item) =>
                      (item.name === source() || item.source === source()) &&
                      (!effectiveWorkspace() || item.project === effectiveWorkspace())
                  )
                ) {
                  abortSearchRequest()
                  abortContextRequest()
                  clearScopedResults()
                  scopeSources(effectiveWorkspace(), '')
                  setSource('')
                  if (isDesktopApp) writeSourceSelectionPreference('')
                }
              }}
            />
          </Suspense>
        ) : view() === 'knowledge' ? (
          <>
            {!graphFullScreen() && (
              <M7PanelBoundary
                side="left"
                breakpoint={800}
                open={leftOpen()}
                title="Sources and documents"
                description="Choose the source or document used by the current workspace."
                finalFocus={sourcePanelOriginRef}
                onOpenChange={setLeftOpen}
              >
                <SourcePanel
                  open={leftOpen()}
                  status={status()}
                  workspace={effectiveWorkspace()}
                  workspaces={workspaces()}
                  documentQuery={documentQuery()}
                  selected={source()}
                  documents={documents()}
                  selectedDocument={activeDocument()?.id ?? ''}
                  documentsLoading={documentsLoading()}
                  documentsError={documentsError()}
                  hasMoreDocuments={Boolean(documentCursor())}
                  statusError={statusError()}
                  onRetryStatus={retryStatus}
                  sourceJobError={sourceJobsError()}
                  onRetrySourceJobs={sourceJobsRetry()}
                  onSelect={chooseSource}
                  onDocumentQueryChange={setDocumentQuery}
                  onSelectDocument={(id) => void chooseDocument(id)}
                  onLoadMoreDocuments={() => void loadMoreDocuments()}
                  onRetryDocuments={retryDocuments}
                  onOpenSourcesSettings={() => {
                    setSettingsSection('sources')
                    setView('settings')
                  }}
                  onOpenSourceSetup={
                    desktopSourceActionsReady()
                      ? (name, project) => void openSourceSetup(name, project)
                      : undefined
                  }
                  onAuthorizeSource={
                    desktopSourceActionsReady()
                      ? (name, project) => void authorizeSource(name, project)
                      : undefined
                  }
                  onToggleSource={
                    desktopSourceActionsReady()
                      ? (name, project, enabled) => void toggleSource(name, project, enabled)
                      : undefined
                  }
                  sourceToggleBusy={sourceToggleBusy()}
                  sourceToggleDisabled={
                    settingsDirty() ||
                    desktopSettings() === null ||
                    Boolean(desktopSettings()?.needs_setup)
                  }
                  sourceToggleError={sourceToggleError()}
                  sourceToggleNotice={sourceToggleNotice()}
                  onClose={() => setLeftOpen(false)}
                  onCancelSourceJob={cancelSourceJob}
                  jobs={sourceJobs.jobs()}
                />
              </M7PanelBoundary>
            )}
            {!graphFullScreen() && (
              <div
                class="pane-resizer source-resizer"
                role="separator"
                aria-label="Resize sources panel"
                aria-orientation="vertical"
                aria-valuemin={220}
                aria-valuemax={maximumPaneWidth('source')}
                aria-valuenow={sourceWidth()}
                tabIndex={0}
                onPointerDown={(event) => beginResize('source', event)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft')
                    setSourceWidth((width) => Math.max(220, width - 16))
                  else if (event.key === 'ArrowRight')
                    setSourceWidth((width) => Math.min(maximumPaneWidth('source'), width + 16))
                  else return
                  event.preventDefault()
                }}
              />
            )}
            <Workspace
              query={activeQuery()}
              answer={answer()}
              reflection={reflection()}
              evidence={evidence()}
              selected={selected()}
              loading={loading()}
              error={error()}
              document={activeDocument()}
              documentLoading={documentLoading()}
              graph={graph()}
              graphLoading={graphLoading()}
              graphError={graphError()}
              graphAppendLoading={graphAppendLoading()}
              onLoadMoreGraph={loadMoreGraph}
              onRetryGraph={retryGraph}
              tab={workspaceTab()}
              onTabChange={setWorkspaceTab}
              onSelect={setSelected}
              onSelectDocument={(id) => void chooseDocument(id)}
              onFocusGraphNode={focusGraphNode}
              graphFocused={graphFocusDocumentId() !== null}
              onResetGraphFocus={() => navigateGraphFocus(null)}
              graphCanGoBack={graphFocusHistoryIndex() > 0}
              graphCanGoForward={graphFocusHistoryIndex() + 1 < graphFocusHistory().length}
              onGraphBack={() => navigateGraphHistory(-1)}
              onGraphForward={() => navigateGraphHistory(1)}
              graphEdgeKind={graphEdgeKind()}
              onGraphEdgeKindChange={setGraphEdgeKind}
              graphOrigin={graphOrigin()}
              onGraphOriginChange={setGraphOrigin}
              graphMinConfidence={graphMinConfidence()}
              onGraphMinConfidenceChange={setGraphMinConfidence}
              onRetry={() => void runSearch(query())}
            />
            {!graphFullScreen() && (
              <M7PanelBoundary
                side="right"
                breakpoint={1281}
                open={rightOpen()}
                title="Agent context"
                description="Inspect the bounded evidence and native memory shared with agent integrations."
                finalFocus={contextPanelOriginRef}
                onOpenChange={setRightOpen}
              >
                <ContextPanel
                  open={rightOpen()}
                  query={activeQuery()}
                  evidence={evidence()}
                  answer={answer()}
                  selected={selected()}
                  status={status()}
                  context={agentContext()}
                  contextTokens={estimateTokens(agentContext())}
                  serverContext={contextBundle()}
                  contextLoading={contextLoading()}
                  contextError={contextError()}
                  onRetrieveContext={() => void retrieveAgentContext()}
                  onSelect={setSelected}
                  onClose={() => setRightOpen(false)}
                />
              </M7PanelBoundary>
            )}
            {!graphFullScreen() && (
              <div
                class="pane-resizer context-resizer"
                role="separator"
                aria-label="Resize context panel"
                aria-orientation="vertical"
                aria-valuemin={280}
                aria-valuemax={maximumPaneWidth('context')}
                aria-valuenow={contextWidth()}
                tabIndex={0}
                onPointerDown={(event) => beginResize('context', event)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft')
                    setContextWidth((width) => Math.min(maximumPaneWidth('context'), width + 16))
                  else if (event.key === 'ArrowRight')
                    setContextWidth((width) => Math.max(280, width - 16))
                  else return
                  event.preventDefault()
                }}
              />
            )}
          </>
        ) : view() === 'inbox' ? (
          <M7ActivityInbox
            status={status()}
            statusError={statusError()}
            sourceJobs={sourceJobs.jobs()}
            sourceJobError={sourceJobsError()}
            onRetrySourceJobs={sourceJobsRetry()}
            onOpenSettings={() => openSettingsAt('sources')}
            onRetryStatus={retryStatus}
            onCancelSourceJob={cancelSourceJob}
          />
        ) : (
          <UtilityView
            kind={view() as UtilityKind}
            status={status()}
            statusError={statusError()}
            onRetryStatus={retryStatus}
            sourceJobs={sourceJobs.jobs()}
            query={activeQuery()}
            answer={answer()}
            evidence={evidence()}
            loading={loading()}
            error={error()}
            contextBundle={contextBundle()}
            contextLoading={contextLoading()}
            contextError={contextError()}
            contextTokens={estimateTokens(agentContext())}
            desktopAvailable={isDesktopApp}
            sourceJobError={sourceJobsError()}
            onRetrySourceJobs={sourceJobsRetry()}
            onSearchFocus={focusSearch}
            onRetrieveContext={() => void retrieveAgentContext()}
            onOpenSettings={() => openSettingsAt(view() === 'index' ? 'sources' : 'services')}
            onOpenProject={() => openDesktopProject()}
            onCancelSourceJob={cancelSourceJob}
          />
        )}
        {
          <M7CommandPalette
            open={commandPaletteOpen()}
            finalFocus={commandPaletteOriginRef}
            onOpenChange={setCommandPaletteOpen}
            workspaces={workspaces()}
            onSearch={focusSearch}
            onFilterDocuments={focusDocumentFilter}
            onChooseWorkspace={(nextWorkspace) => {
              chooseWorkspace(nextWorkspace)
              setDocumentQuery('')
            }}
            onOpenSettings={() => setView('settings')}
          />
        }
        {
          <M7StatusBar demo={isDemoMode}>
            <span class={cn(statusError() ? 'text-destructive' : 'text-foreground')}>
              Index {statusError() ? 'offline' : status() ? 'online' : 'checking'}
            </span>
            <span title={status()?.embedding_fingerprint ?? undefined}>
              Embedding: {embeddingLabel(status()?.embedding_fingerprint)}
            </span>
            <span>Query: {status()?.query.mode ?? '—'}</span>
            <span>
              <FileText class="mr-1 inline size-3" aria-hidden="true" />
              Docs: {status() ? status()!.documents.toLocaleString() : '—'}
            </span>
            <IngestionIndicator status={status()} />
            <ActiveSourceJobs
              jobs={sourceJobs.jobs()}
              onOpen={() => {
                if (!canLeaveSettings()) return
                setView('inbox')
              }}
            />
            <SourceJobsErrorIndicator
              error={sourceJobsError()}
              onOpen={() => {
                if (!canLeaveSettings()) return
                setView('inbox')
              }}
            />
            <SourceJobAttentionIndicator
              jobs={sourceJobs.jobs()}
              onOpen={() => {
                if (!canLeaveSettings()) return
                setView('inbox')
              }}
            />
            <InstallerIndicator
              job={installerJob()}
              onOpen={() => {
                if (!canLeaveSettings()) return
                setSettingsSection('readiness')
                setView('settings')
              }}
            />
            <ServiceActivityIndicator
              activity={serviceActivity()}
              onOpen={() => {
                if (!canLeaveSettings()) return
                setSettingsSection('services')
                setView('settings')
              }}
            />
            <ReadinessActivityIndicator
              activity={readinessActivity()}
              onOpen={() => {
                if (!canLeaveSettings()) return
                setSettingsSection('readiness')
                setView('settings')
              }}
            />
            <ServiceHealthIndicator
              report={desktopServices()}
              error={desktopServicesError()}
              embeddingRequired={desktopSettings()?.embedding.provider !== 'cloud'}
              onOpen={() => {
                if (!canLeaveSettings()) return
                setSettingsSection('services')
                setView('settings')
              }}
            />
            {isDesktopApp ? (
              <Button
                variant="ghost"
                type="button"
                class="status-link"
                onClick={() => {
                  if (!canLeaveSettings()) return
                  setSettingsSection('updates')
                  setView('settings')
                }}
              >
                Cortana {desktopInfo()?.desktop_version || '—'} · Updates
                {desktopUpdateStatusSuffix(desktopUpdate())}
              </Button>
            ) : null}
          </M7StatusBar>
        }
      </div>
    </M7ShellProvider>
  )
}
function IngestionIndicator(_props: { status: BrainStatus | null }) {
  const props = _props
  const runs = () => props.status?.sync_runs ?? []
  const running = () => runs().filter((run) => run.status === 'running').length
  const failed = () =>
    runs().filter((run) => ['failed', 'cancelled', 'budget_exceeded'].includes(run.status)).length
  const state = () =>
    running()
      ? 'running'
      : failed()
        ? 'warning'
        : props.status?.ingestion.scheduled
          ? 'healthy'
          : 'manual'
  const label = () =>
    running()
      ? `${running()} running`
      : failed()
        ? `${failed()} need attention`
        : props.status?.ingestion.scheduled
          ? 'scheduled'
          : 'paused · manual'
  return (
    <Show
      when={props.status}
      fallback={
        <span class="ingestion-health">
          <i /> Ingestion: checking
        </span>
      }
    >
      <span class={`ingestion-health ${state()}`}>
        <i /> Ingestion: {label()}
      </span>
    </Show>
  )
}
function ActiveSourceJobs(_props2: { jobs: DesktopSourceJob[]; onOpen: () => void }) {
  const props = _props2
  const active = () => activeJobs(props.jobs)
  const detail = () =>
    active()
      .map(
        (job) =>
          `${job.project} · ${job.source} · ${job.operation} · ${describeSourceJobProgress(job)}`
      )
      .join(', ')
  return (
    <Show when={active().length > 0}>
      <Button
        variant="ghost"
        type="button"
        class="source-jobs status-link"
        aria-label="Open active source jobs"
        tooltip={`${detail()}. Open the activity inbox.`}
        onClick={props.onOpen}
      >
        <LoaderCircle class="spin" size={13} /> {active().length} active source job
        {active().length === 1 ? '' : 's'}
      </Button>
    </Show>
  )
}
function SourceJobsErrorIndicator(_props3: { error: string; onOpen: () => void }) {
  const props = _props3
  const detail = () => props.error.replace(/\s+/g, ' ').trim()
  const label = () => (detail().length > 160 ? `${detail().slice(0, 157)}…` : detail())
  return (
    <Show when={detail()}>
      <Button
        variant="ghost"
        type="button"
        class="source-jobs status-link attention"
        aria-label="Open source job status"
        tooltip={`${detail()}. Open the activity inbox.`}
        onClick={props.onOpen}
      >
        <i /> Source jobs: {label()}
      </Button>
    </Show>
  )
}
function SourceJobAttentionIndicator(_props4: { jobs: DesktopSourceJob[]; onOpen: () => void }) {
  const props = _props4
  const attention = () => sourceJobAttention(props.jobs)
  const detail = () =>
    attention()
      .map((job) => `${job.project} · ${job.source} · ${job.status}`)
      .join(', ')
  return (
    <Show when={attention().length > 0}>
      <Button
        variant="ghost"
        type="button"
        class="source-jobs status-link attention"
        aria-label="Open source job attention"
        tooltip={`${detail()}. Open the activity inbox.`}
        onClick={props.onOpen}
      >
        <i /> {attention().length} source job{attention().length === 1 ? '' : 's'} need attention
      </Button>
    </Show>
  )
}
function isActiveInstaller(job: DesktopInstallJob): boolean {
  return job.status === 'running' || job.status === 'cancelling'
}
function isMissingInstallerJobError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('installation job was not found')
}
function InstallerIndicator(_props5: { job: DesktopInstallJob | null; onOpen: () => void }) {
  const props = _props5
  const job = () => props.job
  const active = () => job() !== null && isActiveInstaller(job()!)
  const state = () => (active() ? 'running' : job()?.status === 'succeeded' ? 'healthy' : 'warning')
  const label = () =>
    active() ? `Install: ${job()!.tool} · ${job()!.status}` : `Install: ${job()?.status}`
  return (
    <Show when={job()}>
      <Button
        variant="ghost"
        type="button"
        class={`installer-health ${state()}  `}
        aria-label={`Open installer status for ${job()!.tool}`}
        tooltip={`${job()!.summary}. Open readiness for details.`}
        onClick={props.onOpen}
      >
        <i /> {label()}
      </Button>
    </Show>
  )
}
function ServiceActivityIndicator(_props6: {
  activity: DesktopServiceActivity | null
  onOpen: () => void
}) {
  const props = _props6
  const activity = () => props.activity
  const active = () => activity()?.status === 'running'
  const state = () =>
    active() ? 'running' : activity()?.status === 'succeeded' ? 'healthy' : 'warning'
  const action = () => (activity()?.action === 'install' ? 'Install' : activity()?.action)
  return (
    <Show when={activity()}>
      <Button
        variant="ghost"
        type="button"
        class={`service-activity-health ${state()}  `}
        aria-label="Open service activity"
        tooltip={`${action()} ${activity()!.target}${activity()!.detail ? `: ${activity()!.detail}` : ''}. Open services for details.`}
        onClick={props.onOpen}
      >
        {active() && <LoaderCircle class="spin" size={13} />}
        {!active() && <i />}
        Service: {action()} {activity()!.target}
        {active() ? '…' : activity()!.status === 'succeeded' ? ' · done' : ' · failed'}
      </Button>
    </Show>
  )
}
function ReadinessActivityIndicator(_props7: {
  activity: DesktopReadinessActivity | null
  onOpen: () => void
}) {
  const props = _props7
  const activity = () => props.activity
  const active = () => activity()?.status === 'running'
  const state = () =>
    active() ? 'running' : activity()?.status === 'succeeded' ? 'healthy' : 'warning'
  return (
    <Show when={activity()}>
      <Button
        variant="ghost"
        type="button"
        class={`readiness-activity-health ${state()}  `}
        aria-label="Open readiness activity"
        tooltip={`${activity()!.detail || (active() ? 'System readiness scan is running.' : 'System readiness scan completed.')}`}
        onClick={props.onOpen}
      >
        {active() && <LoaderCircle class="spin" size={13} />}
        {!active() && <i />}
        Readiness:{' '}
        {active() ? 'scanning…' : activity()!.status === 'succeeded' ? 'ready' : 'failed'}
      </Button>
    </Show>
  )
}
export function ServiceHealthIndicator(_props8: {
  report: DesktopServiceReport | null
  error: string
  embeddingRequired?: boolean
  onOpen: () => void
}) {
  const props = mergeProps(
    {
      embeddingRequired: true,
    },
    _props8
  )
  const report = () => props.report
  const core = () =>
    report()!.services.filter(
      (service) =>
        service.name === 'server' || (service.name === 'embedding' && props.embeddingRequired)
    )
  const coreLoaded = () => core().filter((service) => service.loaded).length
  const coreExitFailure = () =>
    core().some((service) => service.last_exit_status !== null && service.last_exit_status !== 0)
  const coreAttention = () =>
    core().length === 0 || coreLoaded() < core().length || coreExitFailure()
  const state = () => (!report()!.supported || coreAttention() ? 'warning' : 'healthy')
  const detail = () =>
    report()!
      .services.map(
        (service) =>
          `${service.name}: ${service.state || (service.installed ? 'installed' : 'not installed')}`
      )
      .join(' · ')
  const label = () =>
    !report()!.supported
      ? `Services: unsupported on ${report()!.platform}`
      : coreAttention()
        ? 'Services: core attention'
        : `Services: core ${coreLoaded()}/${core().length} online`
  return (
    <Switch>
      <Match when={props.error}>
        <Button
          variant="ghost"
          type="button"
          class="service-activity-health warning"
          aria-label="Open service health"
          tooltip={`${props.error}. Open Services for details.`}
          onClick={props.onOpen}
        >
          <i /> Services: unavailable
        </Button>
      </Match>
      <Match when={report()}>
        <Button
          variant="ghost"
          type="button"
          class={`service-activity-health ${state()}  `}
          aria-label="Open service health"
          tooltip={`${detail()}. Open Services for controls.`}
          onClick={props.onOpen}
        >
          <i /> {label()}
        </Button>
      </Match>
    </Switch>
  )
}
function desktopUpdateStatusSuffix(update: DesktopUpdate | null): string {
  if (!update) return ''
  if (
    update.phase === 'downloading' ||
    update.phase === 'installing' ||
    update.phase === 'cancelling'
  ) {
    const percent =
      update.total_bytes && update.total_bytes > 0
        ? ` ${Math.min(100, Math.round((update.downloaded_bytes / update.total_bytes) * 100))}%`
        : ''
    return ` · ${update.phase}${percent}`
  }
  if (update.restart_required || update.phase === 'installed') return ' · Restart required'
  if (update.phase === 'failed') return ' · update failed'
  if (update.phase === 'cancelled') return ' · update cancelled'
  if (update.phase === 'unavailable') return ' · no signed package for this platform'
  if (update.phase === 'available' && update.available_version) {
    return ` · ${update.available_version} available`
  }
  return ''
}
