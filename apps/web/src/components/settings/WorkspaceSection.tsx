import { ArrowDown, ArrowUp, LoaderCircle, Plus, Search, Trash2, Upload } from 'lucide-solid'
import { createSignal, For, Index } from 'solid-js'

import { cn } from '../../lib/utils'
import { DEFAULT_THEME, SUPPORTED_THEMES, type ThemeMode } from '../../theme'
import type { DesktopSettings, WorkspaceSettings } from '../../types'
import { readWorkspaceLogoFile, writeWorkspaceLogo } from '../../workspaceLogoStore'
import { WorkspaceLogo } from '../../workspaceLogos'
import {
  moveWorkspaceThemePreference,
  readWorkspaceThemePreferences,
  writeWorkspaceThemePreference,
} from '../../workspaceThemePreference'
import { useSettingsConfirm } from './SettingsConfirm'
import { Field, SettingsSection } from './SettingsLayout'
import {
  deriveWorkspaceIdentifier,
  ensureWorkspaceIdentifierUnique,
  isWorkspaceIdDerivedFromName,
} from './SettingsSourceIdentity'
import {
  SettingsAccordion,
  SettingsAccordionContent,
  SettingsAccordionItem,
  SettingsAccordionTrigger,
  SettingsButton as Button,
  SettingsCard,
  SettingsInput as Input,
  SettingsSelect as Select,
} from './SettingsSurface'
import { applyConfirmed } from './SettingsWorkflowUtils'

export function WorkspaceSection(incoming: {
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
