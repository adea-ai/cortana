import { KeyRound, Plus, Trash2 } from 'lucide-solid'
import { For } from 'solid-js'

import type { AuthPrincipalSettings } from '../../types'
import { useSettingsConfirm } from './SettingsConfirm'
import { Field, SettingsSection, type SettingsSectionProps } from './SettingsLayout'
import {
  SettingsButton as Button,
  SettingsCard,
  SettingsCheckbox,
  SettingsFieldGroup,
  SettingsInput as Input,
} from './SettingsSurface'
import { applyConfirmed } from './SettingsWorkflowUtils'

export function AccessSection(
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
