import { Label } from '@adea-ai/ui/components/ui/label'
import { KeyRound, Plus, Trash2 } from 'lucide-solid'
import { For } from 'solid-js'

import type { AuthPrincipalSettings } from '../../types'
import { useSettingsConfirm } from './SettingsConfirm'
import { type SettingsSectionProps } from './settingsSectionProps'
import { applyConfirmed } from './SettingsWorkflowUtils'
import { FormField, FieldGroup } from '@adea-ai/ui/components/ui/field'
import { SettingsSection } from '@adea-ai/ui/components/composites/settings'
import { ActionButton } from '@adea-ai/ui/components/composites/action-button'
import { Card, CardContent, CardHeader, CardTitle } from '@adea-ai/ui/components/ui/card'
import { Checkbox } from '@adea-ai/ui/components/ui/checkbox'
import { Input } from '@adea-ai/ui/components/ui/input'

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
      bodyLayout="content"
      title="Agent access"
      description="Create named bearer principals with least-privilege scopes and workspace ACL labels. Token values are write-only and never return to the renderer."
    >
      <div class="principal-list">
        <For each={props.settings.auth_principals}>
          {(principal, index) => {
            const secret = props.settings.secrets.find((item) => item.name === principal.token_env)
            return (
              // principals render in settings order
              <Card size="sm">
                <CardHeader>
                  <div class="principal-card-heading">
                    <KeyRound size={16} aria-hidden="true" />
                    <CardTitle>{principal.principal || `Principal ${index() + 1}`}</CardTitle>
                    <ActionButton
                      class="ml-auto"
                      variant="destructive"
                      size="icon-sm"
                      type="button"
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
                      <Trash2 size={15} aria-hidden="true" />
                    </ActionButton>
                  </div>
                </CardHeader>
                <CardContent>
                  <FieldGroup columns={2}>
                    <FormField label="Principal name">
                      <Input
                        value={principal.principal}
                        maxLength={128}
                        required
                        onInput={(event) =>
                          change(index(), {
                            principal: event.target.value,
                          })
                        }
                      />
                    </FormField>
                    <FormField label="Token environment name">
                      <Input
                        value={principal.token_env}
                        maxLength={128}
                        pattern="[A-Za-z_][A-Za-z0-9_]*"
                        required
                        onInput={(event) =>
                          change(index(), {
                            token_env: event.target.value,
                          })
                        }
                      />
                    </FormField>
                    <FormField label="New bearer token" hint="write-only; leave blank to retain">
                      <Input
                        type="password"
                        autocomplete="new-password"
                        value={props.secretValues[principal.token_env] || ''}
                        onInput={(event) =>
                          props.onSecret({
                            ...props.secretValues,
                            [principal.token_env]: event.target.value,
                          })
                        }
                      />
                      {secret?.configured && !props.clearedSecrets.has(principal.token_env) && (
                        <ActionButton
                          tooltip="Clear stored token"
                          variant="destructive"
                          size="sm"
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
                        </ActionButton>
                      )}
                    </FormField>
                    <FormField
                      label="ACL labels"
                      hint="comma-separated workspace IDs; * grants all"
                    >
                      <Input
                        value={principal.acl.join(', ')}
                        onInput={(event) =>
                          change(index(), {
                            acl: event.target.value
                              .split(',')
                              .map((value) => value.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </FormField>
                  </FieldGroup>
                  <div class="scope-options">
                    <For each={['query', 'status', 'admin'] as const}>
                      {(scope) => (
                        <Label>
                          <Checkbox
                            aria-label={`${scope} scope for ${principal.principal}`}
                            checked={principal.scopes.includes(scope)}
                            onChange={(checked: boolean) =>
                              change(index(), {
                                scopes: checked
                                  ? [...principal.scopes, scope]
                                  : principal.scopes.filter((value) => value !== scope),
                              })
                            }
                          />
                          {scope}
                        </Label>
                      )}
                    </For>
                  </div>
                </CardContent>
              </Card>
            )
          }}
        </For>
      </div>
      <ActionButton tooltip="Add principal" variant="secondary" size="sm" onClick={add}>
        <Plus size={15} aria-hidden="true" /> Add principal
      </ActionButton>
      <p class="settings-note">
        Settings take effect after the server restarts. Desktop requests select a matching private
        native credential by scope without exposing it to web content.
      </p>
    </SettingsSection>
  )
}
