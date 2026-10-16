import { AlertDescription, Alert } from '@adea-ai/ui/components/ui/alert'
import type { DesktopSettings } from '../../types'
import { MemoryReview } from '../MemoryReview'
import { type SettingsSectionProps } from './settingsSectionProps'
import { FieldGroup, NumberField } from '@adea-ai/ui/components/ui/field'
import { SettingsSection } from '@adea-ai/ui/components/composites/settings'

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
      <Alert role="status">
        <AlertDescription>
          Knowledge documents remain source-backed. Agents may explicitly remember, recall, and
          redact bounded records through the native MCP, HTTP, or CLI interfaces.
        </AlertDescription>
      </Alert>
      <FieldGroup columns={3}>
        <NumberField
          label="Maximum active memories"
          hint="bounded local record count"
          min={1}
          max={1000000}
          value={props.settings.memory.max_active}
          onChange={(max_active) => change({ max_active })}
        />
        <NumberField
          label="Default confidence"
          hint="0 to 1; agents can override per record"
          min={0}
          max={1}
          step={0.05}
          value={props.settings.memory.default_confidence}
          onChange={(default_confidence) => change({ default_confidence })}
        />
        <NumberField
          label="Default importance"
          hint="0 to 1; used for review and ranking"
          min={0}
          max={1}
          step={0.05}
          value={props.settings.memory.default_importance}
          onChange={(default_importance) => change({ default_importance })}
        />
      </FieldGroup>
      <MemoryReview maxActive={props.settings.memory.max_active} />
    </SettingsSection>
  )
}
