import type { DesktopSettings } from '../../types'

export type SettingsSectionProps = {
  settings: DesktopSettings
  update: (change: (draft: DesktopSettings) => DesktopSettings) => void
}
