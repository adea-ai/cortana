import { SettingsSection } from './SettingsLayout'
import { SettingsButton as Button } from './SettingsSurface'

export function UpdatesSection(props: {
  currentVersion?: string
  onOpenUpdates: (opener?: HTMLButtonElement) => void
}) {
  return (
    <SettingsSection
      bodyLayout="content"
      title="Updates"
      description="Review release notes and manage signed Cortana Desktop updates."
    >
      <div class="update-card">
        <div>
          <span class="eyebrow">Installed version</span>
          <strong>{props.currentVersion || 'Checking…'}</strong>
          <small>Check for updates and browse the complete release history.</small>
        </div>
        <div class="service-actions">
          <Button
            tooltip="Review release notes and update Cortana Desktop."
            variant="default"
            size="sm"
            type="button"
            onClick={(event) => props.onOpenUpdates(event.currentTarget)}
          >
            Open updates
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}
