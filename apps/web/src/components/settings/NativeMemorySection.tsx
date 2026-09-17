import type { DesktopSettings } from '../../types'
import { MemoryReview } from '../MemoryReview'
import { Field, SettingsSection, type SettingsSectionProps } from './SettingsLayout'
import { SettingsAlert, SettingsFieldGroup, SettingsInput as Input } from './SettingsSurface'

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
