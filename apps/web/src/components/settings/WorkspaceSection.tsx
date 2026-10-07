import { Spinner } from '@adea-ai/ui/components/ui/spinner'
import { Alert, AlertDescription } from '@adea-ai/ui/components/ui/alert'
import { InputGroup, InputGroupInput, InputGroupAddon } from '@adea-ai/ui/components/ui/input-group'
import { ArrowDown, ArrowUp, Plus, Search, Trash2, Upload } from 'lucide-solid'
import { useTheme } from '@adea-ai/ui/components/theme'
import { createSignal, Index } from 'solid-js'

import { DEFAULT_THEME, themeDisplayName, type ThemeMode } from '../../theme'
import type { DesktopSettings, WorkspaceSettings } from '../../types'
import { readWorkspaceLogoFile, writeWorkspaceLogo } from '../../workspaceLogoStore'
import { WorkspaceLogo } from '../../workspaceLogos'
import {
  moveWorkspaceThemePreference,
  readWorkspaceThemePreferences,
  writeWorkspaceThemePreference,
} from '../../workspaceThemePreference'
import { useSettingsConfirm } from './SettingsConfirm'
import {
  deriveWorkspaceIdentifier,
  ensureWorkspaceIdentifierUnique,
  isWorkspaceIdDerivedFromName,
} from './SettingsSourceIdentity'
import { applyConfirmed } from './SettingsWorkflowUtils'
import { FormField } from '@adea-ai/ui/components/ui/field'
import { SettingsSection } from '@adea-ai/ui/components/composites/settings'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@adea-ai/ui/components/ui/accordion'
import { ActionButton } from '@adea-ai/ui/components/composites/action-button'
import { Card, CardContent, CardHeader } from '@adea-ai/ui/components/ui/card'
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
  // themes this build does not ship.
  const { themes } = useTheme()
  const [logoError, setLogoError] = createSignal('')
  const [logoLoading, setLogoLoading] = createSignal<string | null>(null)
  // The visible control is a standard button (file inputs cannot hold one), so
  // each card keeps its hidden picker keyed by workspace for that click.
  const logoInputs = new Map<string, HTMLInputElement | undefined>()
  const workspaceLogoInput = (workspaceId: string) => logoInputs.get(workspaceId)
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
                  <div class="workspace-card-heading">
                    <WorkspaceLogo workspace={workspace()} size="large" />
                    <div class="workspace-card-title">
                      <strong>{workspace().name || 'New workspace'}</strong>
                      <small>Workspace identity</small>
                    </div>
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
                      <div class="workspace-order-actions">
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
                          <Trash2 size={15} aria-hidden="true" />
                        </ActionButton>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div class="workspace-identity-row">
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
                    <FormField label="Workspace theme">
                      <NativeSelect
                        class="w-full"
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
                        options={themes
                          .filter((theme) => theme.appearance === 'dark')
                          .map((theme) => ({ value: theme.id, label: themeDisplayName(theme) }))}
                      />
                    </FormField>
                  </div>
                  <Accordion collapsible>
                    <AccordionItem value={`workspace-${workspace().id}`}>
                      <AccordionTrigger>Advanced workspace details</AccordionTrigger>
                      <AccordionContent>
                        <div class="workspace-advanced-fields">
                          <small class="workspace-advanced-note">
                            ID is internal; account labels are optional metadata.
                          </small>
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
