import type { DesktopSettings } from '../../types'

export type SettingsSectionProps = {
  settings: DesktopSettings
  update: (change: (draft: DesktopSettings) => DesktopSettings) => void
}

export { SettingsSection } from '@adea-ai/ui/components/composites/settings'
export { FormField as Field, NumberField } from '@adea-ai/ui/components/ui/field'
