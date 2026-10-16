import { Text } from '@adea-ai/ui/components/ui/typography'
import { Spinner } from '@adea-ai/ui/components/ui/spinner'
import { Alert, AlertDescription } from '@adea-ai/ui/components/ui/alert'
import { InputGroup, InputGroupInput, InputGroupAddon } from '@adea-ai/ui/components/ui/input-group'
import { ArrowDown, ArrowUp, Plus, Search, Trash2, Upload } from 'lucide-solid'
import { useTheme } from '@adea-ai/ui/components/theme/lazy'
import { createSignal, Index, onMount } from 'solid-js'

import { DEFAULT_THEME, themeDisplayName, type ThemeMode } from '../../theme'
import type { DesktopSettings, WorkspaceSettings } from '../../types'
import { readWorkspaceLogoFile, writeWorkspaceLogo } from '../../workspaceLogoStore'
import { WorkspaceLogo } from '../../workspaceLogos'
import {
  clearWorkspaceThemePreference,
  moveWorkspaceThemePreference,
  readDeviceThemePreference,
  readWorkspaceThemePreferences,
  writeDeviceThemePreference,
  writeWorkspaceThemePreference,
} from '../../workspaceThemePreference'
import { useSettingsConfirm } from './SettingsConfirm'
import {
  deriveWorkspaceIdentifier,
  ensureWorkspaceIdentifierUnique,
  isWorkspaceIdDerivedFromName,
} from './SettingsSourceIdentity'
import { applyConfirmed } from './SettingsWorkflowUtils'
import { FieldGroup, FormField } from '@adea-ai/ui/components/ui/field'
import { SettingsSection } from '@adea-ai/ui/components/composites/settings'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@adea-ai/ui/components/ui/accordion'
import { ActionButton } from '@adea-ai/ui/components/composites/action-button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@adea-ai/ui/components/ui/card'
import { Input } from '@adea-ai/ui/components/ui/input'
import { NativeSelect } from '@adea-ai/ui/components/ui/native-select'

// Mirrors the desktop settings guard (apps/desktop/src-tauri/src/settings.rs).
// The cap stays a backend safety bound: the surface never advertises it as a
// number a person is expected to reach.
const MAX_WORKSPACES = 128

export function WorkspaceSection(incoming: {
  settings: DesktopSettings
  update: (change: (draft: DesktopSettings) => DesktopSettings) => void
}) {
  const props = incoming
  const confirm = useSettingsConfirm()
  // The catalogue comes from the shared provider, so the picker never enumerates
  // themes this build does not ship. The provider's lazy entry keeps the catalogue
  // out of startup, so the picker asks for it when it mounts and lists the themes
  // once it arrives. `themes` is read through `sharedTheme`: it is a getter, and a
  // destructured copy would keep the default pair.
  const sharedTheme = useTheme()
  onMount(() => void sharedTheme.loadCatalogue?.())
  const catalogueReady = () => sharedTheme.catalogueReady?.() ?? true
  const themeOptions = (selected: string, leading: { value: string; label: string }[] = []) =>
    catalogueReady()
      ? [
          ...leading,
          ...sharedTheme.themes
            .filter((variant) => variant.appearance === 'dark')
            .map((variant) => ({ value: variant.id, label: themeDisplayName(variant) })),
        ]
      : [{ value: selected, label: 'Loading themes…' }]
  const themeLabel = (themeId: string) => {
    const variant = sharedTheme.themes.find((candidate) => candidate.id === themeId)
    return variant ? themeDisplayName(variant) : themeId
  }
  const [logoError, setLogoError] = createSignal('')
  const [logoLoading, setLogoLoading] = createSignal<string | null>(null)
  // The visible control is a standard button (file inputs cannot hold one), so
  // each card keeps its hidden picker keyed by workspace for that click.
  const logoInputs = new Map<string, HTMLInputElement | undefined>()
  const workspaceLogoInput = (workspaceId: string) => logoInputs.get(workspaceId)
  const [workspaceThemes, setWorkspaceThemes] = createSignal(readWorkspaceThemePreferences())
  // Own-property lookup: a workspace id like `constructor` must not find an inherited member.
  const workspaceOverride = (workspaceId: string): ThemeMode | undefined =>
    Object.hasOwn(workspaceThemes(), workspaceId) ? workspaceThemes()[workspaceId] : undefined
  const [deviceTheme, setDeviceTheme] = createSignal(readDeviceThemePreference() ?? DEFAULT_THEME)
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
      bodyLayout="content"
      title="Workspaces"
      description="Create isolated query scopes and assign each source or account to one workspace. Workspace logos stay local to this Desktop profile and never enter the index or portable settings export."
    >
      {props.settings.workspaces.length > 6 && (
        <FormField
          label="Find workspace"
          hint={`${visibleWorkspaces().length} of ${props.settings.workspaces.length} shown`}
          class="col-span-full"
        >
          <InputGroup>
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={workspaceQuery()}
              onInput={(event) => setWorkspaceQuery(event.target.value)}
              placeholder="Search name, ID, or account label"
              autocomplete="off"
            />
          </InputGroup>
        </FormField>
      )}
      <Card size="sm">
        <CardHeader>
          <CardTitle>Device default theme</CardTitle>
          <CardDescription>
            Applies to every workspace that does not choose its own theme. Stored on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup columns={2}>
            <FormField
              label="Default theme"
              hint={`Workspaces without their own theme use ${themeLabel(deviceTheme())}.`}
            >
              <NativeSelect
                class="w-full"
                aria-label="Device default theme"
                value={deviceTheme()}
                disabled={!catalogueReady()}
                onChange={(event) => {
                  const next = (event.target as HTMLSelectElement).value as ThemeMode
                  setDeviceTheme(next)
                  writeDeviceThemePreference(next)
                }}
                options={themeOptions(deviceTheme())}
              />
            </FormField>
          </FieldGroup>
        </CardContent>
      </Card>
      <div class={`workspace-settings-grid workspace-settings-grid--${visibleWorkspaces().length}`}>
        <Index each={visibleWorkspaces()}>
          {(entry) => {
            // Index keys rows by position so typing (which rebuilds the workspace
            // object) does not remount the card and drop input focus.
            const workspace = () => entry().workspace
            const index = () => entry().index
            return (
              <Card size="sm">
                <CardHeader>
                  <div class="flex flex-wrap items-center gap-2">
                    <WorkspaceLogo workspace={workspace()} size="large" />
                    <div class="flex min-w-40 flex-1 flex-col gap-1">
                      <CardTitle>{workspace().name || 'New workspace'}</CardTitle>
                      <CardDescription>Workspace identity</CardDescription>
                    </div>
                    <div class="ml-auto flex gap-1">
                      <ActionButton
                        variant="ghost"
                        size="icon-sm"
                        type="button"
                        aria-label={`Upload logo for ${workspace().name}`}
                        disabled={logoLoading() === workspace().id}
                        tooltip={
                          logoLoading() === workspace().id
                            ? 'Saving workspace logo'
                            : 'Upload workspace logo'
                        }
                        onClick={() => workspaceLogoInput(workspace().id)?.click()}
                      >
                        {logoLoading() === workspace().id ? (
                          <Spinner size="sm" label="Saving workspace logo" />
                        ) : (
                          <Upload size={14} aria-hidden="true" />
                        )}
                      </ActionButton>
                      <Input
                        ref={(element: HTMLInputElement) => logoInputs.set(workspace().id, element)}
                        type="file"
                        accept="image/*"
                        aria-label={`Upload logo file for ${workspace().name}`}
                        aria-hidden="true"
                        tabIndex={-1}
                        class="hidden"
                        onInput={(event) => {
                          void updateLogo(workspace().id, event.target.files?.[0])
                          event.currentTarget.value = ''
                        }}
                      />
                      {props.settings.workspaces.length > 1 && (
                        <div class="flex gap-1">
                          <ActionButton
                            variant="ghost"
                            size="icon-sm"
                            type="button"
                            aria-label={`Move ${workspace().name} up`}
                            disabled={index() === 0}
                            tooltip="Move workspace up"
                            onClick={() => moveWorkspace(index(), -1)}
                          >
                            <ArrowUp size={15} aria-hidden="true" />
                          </ActionButton>
                          <ActionButton
                            variant="ghost"
                            size="icon-sm"
                            type="button"
                            aria-label={`Move ${workspace().name} down`}
                            disabled={index() === props.settings.workspaces.length - 1}
                            tooltip="Move workspace down"
                            onClick={() => moveWorkspace(index(), 1)}
                          >
                            <ArrowDown size={15} aria-hidden="true" />
                          </ActionButton>
                          <ActionButton
                            variant="destructive"
                            size="icon-sm"
                            type="button"
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
                                  `Remove the ${workspace().name} workspace? This changes only the settings draft and does not delete indexed data.`,
                                  { destructive: true }
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
                            <Trash2 size={15} aria-hidden="true" />
                          </ActionButton>
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <FieldGroup columns={2}>
                    <FormField label="Display name">
                      <Input
                        value={workspace().name}
                        onInput={(event) =>
                          changeWorkspace(index(), {
                            name: event.target.value,
                          })
                        }
                        required
                        maxLength={80}
                      />
                    </FormField>
                    <FormField
                      label="Workspace theme"
                      hint={
                        workspaceOverride(workspace().id)
                          ? `Overrides the device default (${themeLabel(deviceTheme())}). Choose Device default to clear it.`
                          : 'Following the device default.'
                      }
                    >
                      <NativeSelect
                        class="w-full"
                        aria-label={`Theme for ${workspace().name || 'new workspace'}`}
                        value={workspaceOverride(workspace().id) ?? ''}
                        disabled={!catalogueReady()}
                        onChange={(event) => {
                          const next = (event.target as HTMLSelectElement).value as ThemeMode
                          const workspaceId = workspace().id
                          if (!next) {
                            setWorkspaceThemes(
                              ({ [workspaceId]: _cleared, ...remaining }) => remaining
                            )
                            clearWorkspaceThemePreference(workspaceId)
                            return
                          }
                          setWorkspaceThemes((current) => ({
                            ...current,
                            [workspaceId]: next,
                          }))
                          writeWorkspaceThemePreference(workspaceId, next)
                        }}
                        options={themeOptions(workspaceOverride(workspace().id) ?? '', [
                          { value: '', label: `Device default · ${themeLabel(deviceTheme())}` },
                        ])}
                      />
                    </FormField>
                  </FieldGroup>
                  <Accordion collapsible>
                    <AccordionItem value={`workspace-${workspace().id}`}>
                      <AccordionTrigger>Advanced workspace details</AccordionTrigger>
                      <AccordionContent>
                        <div class="workspace-advanced-fields">
                          <Text as="small" variant="micro" tone="muted" class="mb-2 block">
                            ID is internal; account labels are optional metadata.
                          </Text>
                          <FormField
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
                          </FormField>
                          <FormField
                            label="Account label"
                            hint="optional display note; OAuth credentials belong to each source"
                          >
                            <Input
                              value={workspace().account_label || ''}
                              onInput={(event) =>
                                changeWorkspace(index(), {
                                  account_label: event.target.value || null,
                                })
                              }
                              maxLength={128}
                              placeholder="e.g. Nifty League"
                            />
                          </FormField>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            )
          }}
        </Index>
      </div>
      {logoError() && (
        <Alert variant="destructive" role="alert" class="my-2">
          <AlertDescription>{logoError()}</AlertDescription>
        </Alert>
      )}
      <ActionButton
        variant="secondary"
        size="sm"
        type="button"
        disabled={props.settings.workspaces.length >= MAX_WORKSPACES}
        tooltip={
          props.settings.workspaces.length >= MAX_WORKSPACES
            ? `Cortana supports ${MAX_WORKSPACES} workspaces in one profile`
            : 'Add another query scope'
        }
        onClick={addWorkspace}
      >
        <Plus size={15} aria-hidden="true" /> Add workspace
      </ActionButton>
    </SettingsSection>
  )
}
