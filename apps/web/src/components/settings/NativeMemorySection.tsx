import { AlertDescription, Alert } from '@adea-ai/ui/components/ui/alert'
import type { DesktopSettings } from '../../types'
import { MemoryReview } from '../MemoryReview'
import { type SettingsSectionProps } from './settingsSectionProps'
import { FormField, FieldGroup } from '@adea-ai/ui/components/ui/field'
import { SettingsSection } from '@adea-ai/ui/components/composites/settings'
import { Input } from '@adea-ai/ui/components/ui/input'

export function NativeMemorySection(
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
      bodyLayout="content"
      title="Native agentic memory"
      description="Cortana keeps operational memory in its own private local store. Memory is explicit, scoped, auditable, and protected by the local data-directory permissions."
    >
      <Alert class="safety-note" role="status">
        <AlertDescription>
          Knowledge documents remain source-backed. Agents may explicitly remember, recall, and
          redact bounded records through the native MCP, HTTP, or CLI interfaces.
        </AlertDescription>
      </Alert>
      <FieldGroup columns={2}>
        <FormField label="Maximum active memories" hint="bounded local record count">
          <Input
            type="number"
            min={1}
            max={1000000}
            value={props.settings.memory.max_active}
            onInput={(event) =>
              change({
                max_active: Number(event.target.value) || 1,
              })
            }
          />
        </FormField>
        <FormField label="Default confidence" hint="0 to 1; agents can override per record">
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={props.settings.memory.default_confidence}
            onInput={(event) =>
              change({
                default_confidence: Number(event.target.value) || 0,
              })
            }
          />
        </FormField>
        <FormField label="Default importance" hint="0 to 1; used for review and ranking">
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={props.settings.memory.default_importance}
            onInput={(event) =>
              change({
                default_importance: Number(event.target.value) || 0,
              })
            }
          />
        </FormField>
      </FieldGroup>
      <MemoryReview maxActive={props.settings.memory.max_active} />
    </SettingsSection>
  )
}
